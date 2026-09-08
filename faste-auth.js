const FASTE_SUPABASE_URL='https://jmaswyffmeaaauymapmi.supabase.co';
const FASTE_SUPABASE_KEY='sb_publishable_pERmayuxuRzMADUxvJDI2w_vwDCMS9c';
const FASTE_LOGIN='faste-login.html';
(function(){
  const path=location.pathname.split('/').pop()||'index.html';
  if(path===FASTE_LOGIN)return;
  const token=sessionStorage.getItem('faste_access_token');
  if(!token){ location.replace(FASTE_LOGIN+'?next='+encodeURIComponent(path)); return; }
  window.FASTE_HEADERS={apikey:FASTE_SUPABASE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'};
  window.fasteLogout=function(){sessionStorage.removeItem('faste_access_token');sessionStorage.removeItem('faste_user_email');location.replace(FASTE_LOGIN)};
  window.addEventListener('load',()=>{
    const h=document.querySelector('header');
    if(h&&!document.getElementById('fasteLogoutBtn')){const b=document.createElement('button');b.id='fasteLogoutBtn';b.textContent='Déconnexion';b.style.cssText='margin-left:10px;padding:8px 12px;border:1px solid #213650;border-radius:9px;background:#0d1b2d;color:#edf4ff;font-weight:700;cursor:pointer';b.onclick=window.fasteLogout;h.appendChild(b)}
  });
})();
