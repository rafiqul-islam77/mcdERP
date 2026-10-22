// needle-tracker.js
window.trackNeedleActivity = function(type, user, minutes){
  try{
    var activity = JSON.parse(localStorage.getItem('gms_needle_activity') || '[]');
    activity.push({
      type: type,
      user: user || 'Unknown',
      date: new Date().toISOString().slice(0,10),
      minutes: minutes || 5,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem('gms_needle_activity', JSON.stringify(activity));
  }catch(e){ console.warn('Track error:', e); }
};
