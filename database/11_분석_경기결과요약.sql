-- 9경기의 승/무/패 결과 리스트
SELECT 
    m.seq,
    sq1.name AS home_team,
    m.home_score,
    m.away_score,
    sq2.name AS away_team,
    CASE 
        WHEN m.home_score > m.away_score THEN '홈팀 승'
        WHEN m.home_score < m.away_score THEN '원정팀 승'
        ELSE '무승부'
    END AS result
FROM matches m
JOIN squads sq1 ON m.home_squad_id = sq1.id
JOIN squads sq2 ON m.away_squad_id = sq2.id
ORDER BY m.seq;