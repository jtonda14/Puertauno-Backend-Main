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
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required (format: YYYY-MM-DD)' });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Get all accommodation requests with guests and vehicles
    const { data: allData, error } = await supabase.rpc('get_accommodation_requests_full');
    if (error) throw error;

    // Helper function to extract date part (YYYY-MM-DD) from datetime string
    const getDatePart = (dateTimeStr) => {
      if (!dateTimeStr) return null;
      // Handle both "2025-12-30T00:00:00" and "2025-12-30" formats
      return dateTimeStr.split('T')[0];
    };

    // Filter data based on operation type (comparing only date parts)
    const arrivals = allData.filter(item => getDatePart(item.check_in) === date);
    const departures = allData.filter(item => getDatePart(item.check_out) === date);
    const stayovers = allData.filter(item => getDatePart(item.check_in) < date && getDatePart(item.check_out) > date);
    const staying = allData.filter(item => getDatePart(item.check_in) <= date && getDatePart(item.check_out) >= date);

    // Get links for email enrichment and room assignments
    const allIds = staying.map(item => item.id);
    if (allIds.length > 0) {
      // Get links
      const { data: linksData, error: linksError } = await supabase
        .from('links')
        .select('accommodation_request_id, email')
        .in('accommodation_request_id', allIds);

      if (!linksError && linksData) {
        const emailMap = {};
        linksData.forEach(link => {
          emailMap[link.accommodation_request_id] = link.email;
        });

        // Enrich all arrays with email
        [arrivals, departures, stayovers, staying].forEach(arr => {
          arr.forEach(item => {
            if (emailMap[item.id]) {
              item.link_email = emailMap[item.id];
            }
          });
        });
      }

      // Get room assignments with room details
      const { data: roomAssignments, error: roomAssignmentsError } = await supabase
        .from('room_assignments')
        .select(`
          accommodation_request_id,
          rooms(room_name, room_type)
        `)
        .in('accommodation_request_id', allIds);

      if (!roomAssignmentsError && roomAssignments) {
        // Group room assignments by accommodation_request_id
        const roomsMap = {};
        roomAssignments.forEach(assignment => {
          if (!roomsMap[assignment.accommodation_request_id]) {
            roomsMap[assignment.accommodation_request_id] = [];
          }
          if (assignment.rooms) {
            roomsMap[assignment.accommodation_request_id].push({
              room_name: assignment.rooms.room_name,
              room_type: assignment.rooms.room_type
            });
          }
        });

        // Enrich all arrays with room assignments
        [arrivals, departures, stayovers, staying].forEach(arr => {
          arr.forEach(item => {
            item.assigned_rooms = roomsMap[item.id] || [];
          });
        });
      }
    }

    return res.status(200).json({
      date,
      arrivals,
      departures,
      stayovers,
      staying,
      counts: {
        arrivals: arrivals.length,
        departures: departures.length,
        stayovers: stayovers.length,
        staying: staying.length
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

