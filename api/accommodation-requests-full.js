import { getSupabaseClient } from './utils/supabaseClient.js';

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  const supabase = getSupabaseClient(req);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = req.headers.authorization?.split(' ')[1];
  const { data: { user } } = await supabase.auth.getUser(token);

  if (!user) {
    return res.status(450).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // Obtener todas las accommodation_requests con sus guests y vehicles usando join
    const { data, error } = await supabase.rpc('get_accommodation_requests_full');
    if (error) throw error;

    // Obtener los links asociados a los accommodation_requests para incluir el email
    if (data && data.length > 0) {
      const accommodationRequestIds = data.map(item => item.id);
      const { data: linksData, error: linksError } = await supabase
        .from('links')
        .select('accommodation_request_id, email')
        .in('accommodation_request_id', accommodationRequestIds);

      if (!linksError && linksData) {
        // Crear un mapa de accommodation_request_id -> email
        const emailMap = {};
        linksData.forEach(link => {
          emailMap[link.accommodation_request_id] = link.email;
        });

        // Enriquecer los datos con el email del link
        data.forEach(item => {
          if (emailMap[item.id]) {
            item.link_email = emailMap[item.id];
          }
        });
      }
    }

    return res.status(200).json({ accommodation_requests: data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
} 