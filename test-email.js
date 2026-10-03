const key = "sb_publishable_oSM68VF1C-NOQjAtAlg44g_F39kZFkn";
const url = "https://dqpbbzsxfwbozqcguwux.supabase.co/functions/v1/booking-emails";

fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    emailType: "status_update",
    bookingData: {
      id: "123-abc",
      status: "approved",
      check_in: "2026-06-15",
      check_out: "2026-06-20",
      guests: 2,
      total_amount: 5000,
      guest_name: "Dark Kent",
      guest_email: "darkkent73@gmail.com",
    },
  }),
})
  .then((res) => res.json().then((data) => ({ status: res.status, data })))
  .then(console.log)
  .catch(console.error);
