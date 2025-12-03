-- 이번 풋살에 참여 안한 인원 조회
-- (전체 선수 중 squad_members 테이블에 id가 없는 사람 찾기)
SELECT name, position
FROM players
WHERE id NOT IN (SELECT player_id FROM squad_members)
ORDER BY name;