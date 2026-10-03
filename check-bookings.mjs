import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
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
  const res = await fetch(`${VITE_SUPABASE_URL}/rest/v1/bookings?select=*`, {
    headers: {
      apikey: VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${VITE_SUPABASE_ANON_KEY}`
    }
  });
  
  if (res.ok) {
    const data = await res.json();
    console.log("Bookings count:", data.length);
    console.log(data);
  } else {
    console.log("Error checking bookings:", res.status, await res.text());
  }
}
main();
