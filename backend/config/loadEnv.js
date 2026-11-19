import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend/.env first, then fallback to repository root .env without overriding already-set variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();
