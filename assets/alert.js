/* Price-drop alert capture — posts {email, hotelId} to /api/alert. */
document.addEventListener("click", function (e) {
  const b = e.target.closest(".alert-btn");
  if (!b) return;
  const email = prompt('Get an email when the price drops for:\n"' + b.dataset.name + '"\n\nEnter your email:');
  if (!email) return;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { alert("Please enter a valid email address."); return; }
  b.disabled = true; b.textContent = "Setting…";
  fetch("/api/alert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email, hotelId: b.dataset.hid, name: b.dataset.name }),
  })
    .then((r) => r.json())
    .then(() => { b.textContent = "🔔 Alert set!"; })
    .catch(() => { b.disabled = false; b.textContent = "🔔 Price-drop alert"; alert("Couldn't set the alert right now — please try again."); });
});
