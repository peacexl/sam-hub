<?php

declare(strict_types=1);

require_once __DIR__ . '/config.php';

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

function createDatabaseConnection(): mysqli
{
    $connection = new mysqli(
        DB_HOST,
        DB_USER,
        DB_PASS,
        DB_NAME,
        DB_PORT
    );

    $connection->set_charset('utf8mb4');

    return $connection;
}

function ensureRuntimeTables(mysqli $connection): void
{
    $connection->query(
        "CREATE TABLE IF NOT EXISTS user_sessions (
            sid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
            user_id CHAR(36) NOT NULL,
            device_name VARCHAR(120) NOT NULL,
            user_agent VARCHAR(500) NOT NULL,
            created_at DATETIME NOT NULL,
            last_seen DATETIME NOT NULL,
            revoked_at DATETIME NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB"
    );
    $connection->query(
        "CREATE TABLE IF NOT EXISTS request_rate_limits (
            rate_key CHAR(64) NOT NULL,
            route VARCHAR(50) NOT NULL,
            window_started BIGINT NOT NULL,
            attempts INT NOT NULL,
            PRIMARY KEY (rate_key, route)
        ) ENGINE=InnoDB"
    );
}

function ensureDatabaseSchema(mysqli $connection): void
{
    $existingUsers = $connection->query(
        "SELECT 1 FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'users'
        LIMIT 1"
    );
    if ($existingUsers->fetch_row()) {
        ensureRuntimeTables($connection);
        return;
    }

    $schema = file_get_contents(__DIR__ . '/schema.sql');
    if ($schema === false || trim($schema) === '') {
        return;
    }

    if (!$connection->multi_query($schema)) {
        throw new RuntimeException('Schema initialization failed: ' . $connection->error);
    }

    do {
        if ($result = $connection->store_result()) {
            $result->free();
        }
    } while ($connection->more_results() && $connection->next_result());

    ensureRuntimeTables($connection);
}

function initializeDatabase(): mysqli
{
    $databaseStage = 'connection';
    try {
        $database = createDatabaseConnection();
        $databaseStage = 'schema initialization';
        ensureDatabaseSchema($database);
        return $database;
    } catch (Throwable $exception) {
        error_log('Database ' . $databaseStage . ' failed: ' . $exception->getMessage());

        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');

        echo json_encode([
            'message' => $databaseStage === 'connection'
                ? 'Could not connect to the database. Check the MySQL host, database name, username, and password in the hosting configuration.'
                : 'Could not initialize the database tables. Check the imported schema, table permissions, and hosting PHP error log.'
        ]);

        exit;
    }
}

return initializeDatabase();
