/* fonts.js — يفعّل خطوط Google بدون ما يحجب عرض الصفحة (الرابط يُحمَّل بـ media=print ثم يتحول لـ all) */
(function () {
  var l = document.getElementById('gf');
  if (!l) return;
  var on = function () { l.media = 'all'; };
  if (l.sheet) on(); else { l.addEventListener('load', on); l.addEventListener('error', on); }
})();
