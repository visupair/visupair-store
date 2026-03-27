-- Migration number: 002 	 2024-05-22T12:00:00.000Z
CREATE TABLE IF NOT EXISTS favorite (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    productId TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);
