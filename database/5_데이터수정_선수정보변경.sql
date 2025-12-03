-- [UPDATE] C팀 장지영 선수가 2골 활약 후 포지션을 GK로 변경
UPDATE players 
SET position = 'GK' 
WHERE name = '장지영';

-- [UPDATE] 미참여 인원 중 '최광민' 선수는 개인 사정으로 비활성화
UPDATE players
SET is_active = 0
WHERE name = '최광민';