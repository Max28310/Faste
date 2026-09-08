/* FASTE — session Supabase unique */
const FASTE_SUPABASE_URL = 'https://jmaswyffmeaaauymapmi.supabase.co';
const FASTE_SUPABASE_KEY = 'sb_publishable_pERmayuxuRzMADUxvJDI2w_vwDCMS9c';
const fasteSupabase = window.supabase.createClient(FASTE_SUPABASE_URL, FASTE_SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

window.fasteAuth = {
  client: fasteSupabase,
  async session() {
    const { data, error } = await fasteSupabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },
  async requireSession() {
    const session = await this.session();
    if (!session) {
      const next = encodeURIComponent(location.pathname.split('/').pop() + location.hash);
      location.replace(`faste-login.html?next=${next}`);
      return null;
    }
    return session;
  },
  async logout() {
    await fasteSupabase.auth.signOut({ scope: 'local' });
    location.replace('faste-login.html');
  }
};

navigator.serviceWorker?.getRegistrations().then(registrations => {
  registrations.forEach(registration => registration.unregister());
}).catch(() => {});
