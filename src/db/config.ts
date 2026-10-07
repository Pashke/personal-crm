// Postgres connection settings built from the same variables docker-compose.yml uses,
// so .env stays the single place where credentials live.
export function getDatabaseConfig() {
  return {
    host: "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: requireEnv("POSTGRES_USER"),
    password: requireEnv("POSTGRES_PASSWORD"),
    database: requireEnv("POSTGRES_DB"),
    ssl: false,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  }
  return value;
}
