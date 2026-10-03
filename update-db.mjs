import fs from 'fs';
import path from 'path';

// Parse .env manually
const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val) {
    env[key.trim()] = val.join('=').trim().replace(/['"]/g, '');
  }
});

const VITE_SUPABASE_URL = env['VITE_SUPABASE_URL'];
const VITE_SUPABASE_ANON_KEY = env['VITE_SUPABASE_PUBLISHABLE_KEY'];

async function main() {
  const res = await fetch(`${VITE_SUPABASE_URL}/rest/v1/rooms?select=*`, {
    headers: {
      apikey: VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${VITE_SUPABASE_ANON_KEY}`
    }
  });
  
  const data = await res.json();
  
  for (const r of data) {
    if (r.type === 'villa' || r.name.toLowerCase().includes('villa')) {
      const newName = r.name.replace(/villa/ig, 'Function Hall');
      console.log(`Renaming ${r.name} to ${newName}`);
      
      const updateRes = await fetch(`${VITE_SUPABASE_URL}/rest/v1/rooms?id=eq.${r.id}`, {
        method: 'PATCH',
        headers: {
          apikey: VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ name: newName })
      });
      if (!updateRes.ok) {
        console.error('Failed to update:', await updateRes.text());
      }
    }
  }
  console.log('Done!');
}

main();
