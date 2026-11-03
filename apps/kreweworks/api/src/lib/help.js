'use strict';
// Help and training content for the in-portal Help page.
// A client profile may carry:
//   "help": { "intro": "...", "videos": [ { "id", "title", "description", "file", "poster", "duration", "roles": ["manager","hr","it"] } ] }
// Video and poster files ship with the client package under app/help/ (served at /help/<file>), which the
// Static Web Apps route table keeps behind sign-in like every other page. The engine never holds client files.
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const ROLES = ['manager', 'hr', 'it', 'admin'];

function normalize(raw) {
  const h = raw && typeof raw === 'object' ? raw : {};
  const videos = (Array.isArray(h.videos) ? h.videos : []).map((v, i) => {
    if (!v || !SAFE_FILE.test(String(v.file || ''))) return null;
    if (v.poster && !SAFE_FILE.test(String(v.poster))) return null;
    return {
      id: String(v.id || v.file.replace(/\.[^.]+$/, '') || `video-${i + 1}`).replace(/[^A-Za-z0-9_-]/g, '-'),
      title: String(v.title || v.file), description: String(v.description || ''),
      file: v.file, poster: v.poster || '', duration: String(v.duration || ''),
      roles: (Array.isArray(v.roles) ? v.roles : []).filter(r => ROLES.includes(r))
    };
  }).filter(Boolean);
  return { intro: String(h.intro || ''), videos };
}

// What one signed-in caller may see. Admins see everything; a video with no roles is for everyone.
function forCaller(help, role) {
  const h = help || { intro: '', videos: [] };
  return {
    intro: h.intro,
    videos: h.videos.filter(v => !v.roles.length || role === 'admin' || v.roles.includes(role)).map(v => ({
      id: v.id, title: v.title, description: v.description, duration: v.duration,
      src: `/help/${encodeURIComponent(v.file)}`, poster: v.poster ? `/help/${encodeURIComponent(v.poster)}` : ''
    }))
  };
}

module.exports = { normalize, forCaller, SAFE_FILE };
