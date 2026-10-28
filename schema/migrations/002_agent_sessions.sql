CREATE TABLE IF NOT EXISTS agent_sessions (
    id VARCHAR(64) PRIMARY KEY,
    model VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
    prompt TEXT NOT NULL,
    final_message TEXT,
    total_duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_steps (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    step_index INTEGER NOT NULL,
    thought TEXT,
    tool_name VARCHAR(64),
    tool_args JSONB,
    tool_result JSONB,
    interceptor_status VARCHAR(32) NOT NULL DEFAULT 'PASSED',
    violations JSONB,
    duration_ms INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_steps_session_id ON agent_steps(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
