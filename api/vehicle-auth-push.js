import fetch from 'node-fetch';
import { getSupabaseClient } from './utils/supabaseClient.js';
import https from 'https';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

export default async function handler(req, res) {
  const supabase = getSupabaseClient(req);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Cert-Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = req.headers.authorization?.split(' ')[1];
  const { data: { user } } = await supabase.auth.getUser(token);

  if (!user) {
    return res.status(450).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const authHeader = req.headers['Cert-Authorization'] || req.headers['cert-authorization'];
  if (!authHeader) {
    return res.status(400).json({ error: 'Missing Authorization header' });
  }

  try {
    let vehicles;
    // Si el body tiene un id, obtener solo ese vehicle
    if (req.body && typeof req.body === 'object' && req.body.id) {
      const { data, error: reqError } = await supabase
        .from('vehicles')
        .select('id, license_plate, accommodation_requests(check_in, check_out)')
        .eq('id', req.body.id)
        .eq('sent', false);
      if (reqError) throw reqError;
      vehicles = data;
    } else {
      // Si no hay id, obtener todos los vehicles no enviados
      const { data, error: reqError } = await supabase
        .from('vehicles')
        .select('id, license_plate, accommodation_requests(check_in, check_out)')
        .eq('sent', false);
      if (reqError) throw reqError;
      vehicles = data;
    }

    // Para cada vehicle, generar payload JSON y hacer POST
    const results = [];
    const updateIds = [];
    for (const vehicle of vehicles) {
      try {
        // Obtener las fechas de accommodation_requests
        const checkIn = vehicle.accommodation_requests?.check_in;
        const checkOut = vehicle.accommodation_requests?.check_out;
        
        if (!checkIn || !checkOut) {
          throw new Error('Faltan fechas de check_in o check_out');
        }

        // Convertir fechas a timestamps con horas específicas
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        
        // Setear check_in a 00:00:00 del día
        checkInDate.setHours(0, 0, 0, 0);
        
        // Setear check_out a 23:59:59 del día
        checkOutDate.setHours(23, 59, 59, 999);

        const payload = {
          codigoColectivo: req.body.codigoColectivo,
          codigoUsuario: req.body.codigoUsuario,
          codigoZona: 1,
          matricula: vehicle.license_plate,
          fechaInicio: checkInDate.getTime(),
          fechaFin: checkOutDate.getTime(),
        };

        console.log('Request to be sent:', payload);
        console.log('AuthHeader:', authHeader);
        throw new Error('Error generating payload');
        
        const response = await fetch(
          'https://zbe-api.benidorm.org/api/exp/gateway/v1/acceso/puntuales/rangofecha?scope=colectivo',
          {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            redirect: 'follow',
            agent: httpsAgent,
          }
        );
        
        const text = await response.text();
        if (response.ok) {
          updateIds.push(vehicle.id);
        }
        results.push({
          request_id: vehicle.id,
          status: response.status,
          response: text,
        });
      } catch (err) {
        console.error('Error sending request:', err);
        results.push({
          request_id: vehicle.id,
          error: err.message,
        });
      }
    }
    
    if (updateIds.length > 0) {
      try {
        await supabase
          .from('vehicles')
          .update({ sent: true })
          .in('id', updateIds);
      } catch (updateErr) {
        console.error('Error updating sent field:', updateErr);
      }
    }
    
    // Comprobar si hay errores
    if (errorResults.length > 0) {
      return res.status(500).json({
        error: 'No se pudieron enviar algunos vehículos',
        errors: errorResults,
        results,
      });
    }
    res.status(200).json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
} 