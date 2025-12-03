-- 팀별 총 득점 집계
-- squads와 match_records를 조인하여 계산
SELECT sq.name AS team_name, SUM(mr.goals) AS total_goals
FROM squads sq
JOIN squad_members sm ON sq.id = sm.squad_id
JOIN match_records mr ON sm.player_id = mr.player_id
GROUP BY sq.name
ORDER BY total_goals DESC;