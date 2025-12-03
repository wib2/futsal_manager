const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const pool = require('./config/db'); // db.js 경로 확인해주세요

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// --- 1. 선수 관리 API (기존과 동일하지만 안전하게 포함) ---
app.get('/api/players', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM players ORDER BY name');
    const players = rows.map(r => ({
      id: r.id,
      name: r.name,
      pos: r.position,
      active: r.is_active === 1
    }));
    res.json(players);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

app.post('/api/players', async (req, res) => {
  const { name, pos, active } = req.body;
  try {
    const id = uuidv4();
    await pool.query(
      'INSERT INTO players (id, name, position, is_active) VALUES (?, ?, ?, ?)',
      [id, name, pos, active ? 1 : 0]
    );
    res.status(201).json({ id, name, pos, active });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') res.status(409).json({ message: '중복된 이름' });
    else { console.error(err); res.status(500).json({ message: 'Server Error' }); }
  }
});

app.put('/api/players/:id', async (req, res) => {
  const { id } = req.params;
  const { name, pos, active } = req.body;
  try {
    await pool.query(
      'UPDATE players SET name=?, position=?, is_active=? WHERE id=?',
      [name, pos, active ? 1 : 0, id]
    );
    res.json({ id, name, pos, active });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server Error' }); }
});

app.delete('/api/players/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query('DELETE FROM players WHERE id = ?', [id]);
      res.json({ message: 'Deleted successfully', id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server Error' });
    }
});

// --- 2. 데이터 불러오기 (GET /api/sessions) ---
// [변경] 삭제된 컬럼들을 제외하고 조회하도록 수정됨
app.get('/api/sessions', async (req, res) => {
  try {
    // notes 제외됨
    const [sessions] = await pool.query('SELECT * FROM sessions ORDER BY session_date DESC');
    
    const result = {}; 

    for (const session of sessions) {
      const sId = session.id;
      const dateKey = session.session_date; 

      // formation, is_confirmed 제외됨
      const [squads] = await pool.query('SELECT * FROM squads WHERE session_id = ?', [sId]);
      
      const rosters = { A: [], B: [], C: [], D: [] };
      const teamNames = { A: '팀 A', B: '팀 B', C: '팀 C', D: '팀 D' };
      const defAwards = { A: null, B: null, C: null, D: null };
      
      const squadIdToCode = {};

      for (const sq of squads) {
        const code = sq.team_code; 
        squadIdToCode[sq.id] = code;

        teamNames[code] = sq.name;
        defAwards[code] = sq.def_mvp_id;
        
        const [members] = await pool.query('SELECT player_id FROM squad_members WHERE squad_id = ?', [sq.id]);
        rosters[code] = members.map(m => m.player_id);
      }

      // gkHome, gkAway 제외됨
      const [matches] = await pool.query('SELECT * FROM matches WHERE session_id = ? ORDER BY seq', [sId]);
      const matchStats = {};
      const matchesList = [];

      for (const m of matches) {
        const homeCode = squadIdToCode[m.home_squad_id] || 'A';
        const awayCode = squadIdToCode[m.away_squad_id] || 'B';

        matchesList.push({
          id: m.id,
          seq: m.seq,
          home: homeCode,
          away: awayCode,
          hg: m.home_score,
          ag: m.away_score
          // gk 정보 삭제됨
        });

        // is_cleansheet 제외됨
        const [records] = await pool.query('SELECT * FROM match_records WHERE match_id = ?', [m.id]);
        const stats = {};
        records.forEach(r => {
          stats[r.player_id] = {
            goals: r.goals,
            assists: r.assists
          };
        });
        matchStats[m.id] = stats;
      }

      result[dateKey] = {
        rosters,
        matches: matchesList,
        matchStats,
        defAwards,
        teamNames,
        hasTeamD: session.has_team_d === 1
        // notes 삭제됨
      };
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Data Load Error' });
  }
});

// --- 3. 데이터 저장 (POST /api/sessions) ---
// [변경] 삭제된 컬럼에 값을 넣지 않도록 INSERT/UPDATE 구문 수정됨
app.post('/api/sessions', async (req, res) => {
  const { sessionDate, sessionData } = req.body; 

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. 세션 저장 (notes 컬럼 제거)
    const [exist] = await connection.query('SELECT id FROM sessions WHERE session_date = ?', [sessionDate]);
    let sessionId = exist.length > 0 ? exist[0].id : uuidv4();

    if (exist.length > 0) {
      await connection.query(
        'UPDATE sessions SET has_team_d=? WHERE id=?',
        [sessionData.hasTeamD, sessionId]
      );
    } else {
      await connection.query(
        'INSERT INTO sessions (id, session_date, has_team_d) VALUES (?, ?, ?)',
        [sessionId, sessionDate, sessionData.hasTeamD]
      );
    }

    // 2. 스쿼드 저장 (formation, is_confirmed 제거)
    const teams = ['A', 'B', 'C'];
    if (sessionData.hasTeamD) teams.push('D');
    
    const squadCodeToId = {};

    for (const code of teams) {
      const [sqRows] = await connection.query(
        'SELECT id FROM squads WHERE session_id=? AND team_code=?', 
        [sessionId, code]
      );
      let squadId = sqRows.length > 0 ? sqRows[0].id : uuidv4();
      squadCodeToId[code] = squadId;

      const tName = sessionData.teamNames ? sessionData.teamNames[code] : `팀 ${code}`;
      const tDef = sessionData.defAwards ? sessionData.defAwards[code] : null;

      if (sqRows.length > 0) {
        await connection.query(
          'UPDATE squads SET name=?, def_mvp_id=? WHERE id=?',
          [tName, tDef, squadId]
        );
      } else {
        await connection.query(
          'INSERT INTO squads (id, session_id, team_code, name, def_mvp_id) VALUES (?, ?, ?, ?, ?)',
          [squadId, sessionId, code, tName, tDef]
        );
      }

      // 3. 멤버 저장 (변동 없음)
      await connection.query('DELETE FROM squad_members WHERE squad_id=?', [squadId]);
      const members = sessionData.rosters[code] || [];
      if (members.length > 0) {
        const memberValues = members.map(pid => [squadId, pid]);
        await connection.query('INSERT INTO squad_members (squad_id, player_id) VALUES ?', [memberValues]);
      }
    }

    // 4. 경기 저장 (home_gk_id, away_gk_id 제거)
    await connection.query('DELETE FROM matches WHERE session_id=?', [sessionId]);

    const matches = sessionData.matches || [];
    const matchStats = sessionData.matchStats || {};

    for (const m of matches) {
      const homeSquadId = squadCodeToId[m.home];
      const awaySquadId = squadCodeToId[m.away];

      if (!homeSquadId || !awaySquadId) continue; 

      const matchId = uuidv4(); 
      
      await connection.query(
        `INSERT INTO matches (id, session_id, seq, home_squad_id, away_squad_id, home_score, away_score)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [matchId, sessionId, m.seq, homeSquadId, awaySquadId, m.hg, m.ag]
      );

      // 5. 기록 저장 (is_cleansheet 제거)
      const stats = matchStats[m.id]; 
      if (stats) {
        const recordValues = [];
        for (const [pid, val] of Object.entries(stats)) {
          recordValues.push([matchId, pid, val.goals || 0, val.assists || 0]);
        }
        if (recordValues.length > 0) {
          await connection.query(
            'INSERT INTO match_records (match_id, player_id, goals, assists) VALUES ?',
            [recordValues]
          );
        }
      }
    }

    await connection.commit();
    res.json({ message: 'Saved successfully', sessionId });

  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ message: 'Save Failed' });
  } finally {
    connection.release();
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});