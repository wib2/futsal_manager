-- '실버 팀'(B팀)의 5인 로스터 조회
SELECT p.name, p.position
FROM players p
WHERE p.id IN (
    SELECT player_id 
    FROM squad_members 
    WHERE squad_id = (SELECT id FROM squads WHERE name = '실버 팀')
);