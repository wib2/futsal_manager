USE futsal_app;

-- 1. 선수 테이블
CREATE TABLE IF NOT EXISTS players (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    position VARCHAR(10) DEFAULT '필드', 
    is_active TINYINT(1) DEFAULT 1
);

-- 2. 세션 테이블
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(36) PRIMARY KEY,
    session_date DATE NOT NULL,
    has_team_d TINYINT(1) DEFAULT 0
);

-- 3. 스쿼드 테이블 
CREATE TABLE IF NOT EXISTS squads (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    team_code CHAR(1) NOT NULL, 
    name VARCHAR(50),
    def_mvp_id VARCHAR(36), 
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 4. 스쿼드 멤버 테이블
CREATE TABLE IF NOT EXISTS squad_members (
    squad_id VARCHAR(36) NOT NULL,
    player_id VARCHAR(36) NOT NULL,
    PRIMARY KEY (squad_id, player_id),
    FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

-- 5. 매치 테이블
CREATE TABLE IF NOT EXISTS matches (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    seq INT NOT NULL,
    home_squad_id VARCHAR(36) NOT NULL,
    away_squad_id VARCHAR(36) NOT NULL,
    home_score INT DEFAULT 0,
    away_score INT DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 6. 경기 기록 테이블
CREATE TABLE IF NOT EXISTS match_records (
    match_id VARCHAR(36) NOT NULL,
    player_id VARCHAR(36) NOT NULL,
    goals INT DEFAULT 0,
    assists INT DEFAULT 0,
    PRIMARY KEY (match_id, player_id),
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);