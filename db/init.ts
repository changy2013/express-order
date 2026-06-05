import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env or .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const databaseUrl = process.env.DATABASE_URL;

async function initDb() {
  if (!databaseUrl) {
    console.error('\x1b[31m%s\x1b[0m', '错误: 未找到 DATABASE_URL 环境变量。');
    console.log('请在 .env.local 或 .env 文件中设置 DATABASE_URL，例如:');
    console.log('DATABASE_URL=postgresql://user:password@localhost:5432/dbname');
    process.exit(1);
  }

  console.log(`正在连接数据库进行初始化: ${databaseUrl.replace(/:[^:@/]+@/, ':****@')}`);
  
  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('数据库连接成功！');

    const sqlPath = path.resolve(process.cwd(), 'db/init.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`找不到 SQL 初始化文件: ${sqlPath}`);
    }

    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
    console.log('正在执行初始化 SQL 语句...');
    
    // PostgreSQL can execute multiple statements separated by semicolons in a single query call
    await client.query(sqlContent);
    
    console.log('\x1b[32m%s\x1b[0m', '数据库初始化成功！所有表结构已创建。');
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', '数据库初始化失败:');
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

initDb();
