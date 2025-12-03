-- 이번 세션 개인 득점 순위
SELECT 
    p.name, 
    s.name AS team, 
    SUM(r.goals) AS goals, 
    SUM(r.assists) AS assists
FROM players p
JOIN match_records r ON p.id = r.player_id
JOIN squad_members sm ON p.id = sm.player_id
JOIN squads s ON sm.squad_id = s.id
GROUP BY p.id, p.name, s.name  
HAVING SUM(r.goals) > 0
ORDER BY goals DESC, assists DESC;