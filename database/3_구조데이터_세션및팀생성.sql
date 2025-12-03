-- [시나리오] 
-- 전체 인원 23명 중, 15명(각 팀 5명)만 선발. 나머지 8명은 미참여.
-- 세션 생성 (notes 컬럼 삭제됨)
INSERT IGNORE INTO sessions (id, session_date, has_team_d) VALUES 
('s01', CURDATE(), 0);

-- 팀 생성
INSERT IGNORE INTO squads (id, session_id, team_code, name) VALUES 
('sqA', 's01', 'A', '골드 팀'),
('sqB', 's01', 'B', '실버 팀'),
('sqC', 's01', 'C', '브론즈 팀');

-- 스쿼드 멤버 배정 (각 팀 5명, 총 15명)
INSERT IGNORE INTO squad_members (squad_id, player_id) VALUES 
-- [A팀]: 강민성, 강종혁, 김규연, 배호성, 김한진(GK)
('sqA', 'p01'), ('sqA', 'p02'), ('sqA', 'p03'), ('sqA', 'p05'), ('sqA', 'p04'),

-- [B팀]: 성은호, 이세형, 윤호석, 이창주, 이용범(GK)
('sqB', 'p06'), ('sqB', 'p07'), ('sqB', 'p08'), ('sqB', 'p10'), ('sqB', 'p09'),

-- [C팀]: 이호준, 장지영, 정민창, 조건희, 최준형(GK)
('sqC', 'p11'), ('sqC', 'p12'), ('sqC', 'p13'), ('sqC', 'p15'), ('sqC', 'p20');