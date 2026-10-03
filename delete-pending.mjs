import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val) {
    env[key.trim()] = val.join('=').trim().replace(/['"]/g, '');
  }
});

async function run() {
  const res = await fetch(env['VITE_SUPABASE_URL'] + '/rest/v1/bookings?status=eq.pending', {
    method: 'DELETE',
    headers: {
      apikey: env['VITE_SUPABASE_PUBLISHABLE_KEY'],
      Authorization: 'Bearer ' + env['VITE_SUPABASE_PUBLISHABLE_KEY']
    }
  });
  if (res.ok) console.log('Deleted successfully');
  else console.error(await res.text());
}
run();
