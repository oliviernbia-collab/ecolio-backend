// Interface commune pour un fournisseur SMS : send(to, message) -> {success, providerId?, error?}
// MockSmsProvider simule l'envoi (log uniquement) en attendant le branchement d'un vrai fournisseur
// (Orange SMS API, Twilio, Africa's Talking...). Remplacer l'export ci-dessous suffit à changer de fournisseur
// sans toucher aux contrôleurs qui consomment `send()`.

class MockSmsProvider {
  async send(to, message) {
    console.log(`[SMS mock] → ${to} : ${message.slice(0, 60)}${message.length > 60 ? '…' : ''}`);
    await new Promise(r => setTimeout(r, 30));
    return { success: true, providerId: `mock-${Date.now()}-${Math.round(Math.random() * 1000)}` };
  }
}

module.exports = { smsProvider: new MockSmsProvider() };
