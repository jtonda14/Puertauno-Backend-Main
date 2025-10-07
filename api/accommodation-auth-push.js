import FormData from 'form-data';
import fetch from 'node-fetch';
import { getSupabaseClient } from './utils/supabaseClient.js';
import https from 'https';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

function buildTag(tag, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<${tag}>${value}</${tag}>`;
}

function buildGuestXML(g) {
  return [
    '<persona>',
    buildTag('rol', g.role),
    buildTag('nombre', g.first_name),
    buildTag('apellido1', g.last_name1),
    buildTag('apellido2', g.last_name2),
    buildTag('tipoDocumento', g.document_type),
    buildTag('numeroDocumento', g.document_number),
    buildTag('soporteDocumento', g.document_support),
    buildTag('fechaNacimiento', g.birth_date),
    '<direccion>',
    buildTag('direccion', g.address),
    buildTag('codigoMunicipio', g.city_code),
    buildTag('nombreMunicipio', g.city_name),
    buildTag('codigoPostal', g.postal_code),
    buildTag('pais', g.country),
    '</direccion>',
    buildTag('telefono', g.phone),
    buildTag('correo', g.email),
    '</persona>\n'
  ].join('\n');
}

function buildXML(request, guests) {
  return `<ns2:peticion xmlns:ns2=\"http://www.neg.hospedajes.mir.es/altaParteHospedaje\">\n  <solicitud>\n    ${buildTag('codigoEstablecimiento', request.establishment_code)}\n    <comunicacion>\n      <contrato>\n        ${buildTag('referencia', request.contract_reference)}\n        ${buildTag('fechaContrato', request.contract_date)}\n        ${buildTag('fechaEntrada', request.check_in ? (request.check_in.toISOString ? request.check_in.toISOString().split('T').join('T').slice(0, 19) : request.check_in) : '')}\n        ${buildTag('fechaSalida', request.check_out ? (request.check_out.toISOString ? request.check_out.toISOString().split('T').join('T').slice(0, 19) : request.check_out) : '')}\n        ${buildTag('numPersonas', request.num_guests || guests.length)}\n        ${buildTag('numHabitaciones', request.num_rooms)}\n        ${buildTag('internet', request.internet === true ? 'true' : request.internet === false ? 'false' : undefined)}\n        <pago>\n          ${buildTag('tipoPago', request.payment_type)}\n        </pago>\n      </contrato>\n      ${guests.map(buildGuestXML).join('')}\n    </comunicacion>\n  </solicitud>\n</ns2:peticion>`;
}

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
    let requestsWithGuests;
    // Si el body tiene un id, obtener solo ese accommodation request
    if (req.body && typeof req.body === 'object' && req.body.id) {
      const { data, error: reqError } = await supabase
        .from('accommodation_requests')
        .select('*, guests(*)')
        .eq('id', req.body.id)
        .eq('sent', false);
      if (reqError) throw reqError;
      requestsWithGuests = data;
    } else {
      // Si no hay id, obtener todas las accommodation_requests no enviadas
      const { data, error: reqError } = await supabase
        .from('accommodation_requests')
        .select('*, guests(*)')
        .eq('sent', false);
      if (reqError) throw reqError;
      requestsWithGuests = data;
    }

    // Para cada request, generar XML y hacer POST
    const results = [];
    const updateIds = [];
    for (const reqWithGuests of requestsWithGuests) {
      const xml = buildXML(reqWithGuests, reqWithGuests.guests);
      const form = new FormData();
      form.append('fichero', Buffer.from(xml, 'utf-8'), {
        filename: 'comunicacion.xml',
        contentType: 'multipart/form',
      });
      try {
        console.log('Request to be sent:', xml);
        // throw new Error('Request not sent for testing purposes');
        const response = await fetch(
          `https://hospedajes.ses.mir.es/hospedajes-web/rest/v1/ComunicacionFichero/?codTipoOperacion=A&codigoArrendador=0000141610&codigoEstablecimiento=${reqWithGuests.establishment_code}&idTipoComunicacion=1`,
          {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              ...form.getHeaders(),
            },
            body: form,
            redirect: 'follow',
            agent: httpsAgent,
          }
        );
        const text = await response.text();
        if (response.ok) {
          updateIds.push(reqWithGuests.id);
        }
        results.push({
          request_id: reqWithGuests.id,
          status: response.status,
          response: text,
        });
      } catch (err) {
        console.error('Error sending request:', err);
        results.push({
          request_id: reqWithGuests.id,
          error: err.message,
        });
      }
    }
    // Actualizar todos los 'sent' a TRUE y 'status' a 'ok' de una vez
    if (updateIds.length > 0) {
      try {
        await supabase
          .from('accommodation_requests')
          .update({ status: 'ok', sent: true })
          .in('id', updateIds);
      } catch (updateErr) {
        console.error('Error updating sent field:', updateErr);
      }
    }
    // Actualizar los requests con error a status = 'send-error'
    const errorResults = results.filter(r => r.error);
    const errorIds = errorResults.map(r => r.request_id);
    if (errorIds.length > 0) {
      try {
        await supabase
          .from('accommodation_requests')
          .update({ status: 'send-error' })
          .in('id', errorIds);
      } catch (updateErr) {
        console.error('Error updating error status:', updateErr);
      }
    }
    // Comprobar si hay errores
    if (errorResults.length > 0) {
      return res.status(500).json({
        error: 'No se pudieron enviar algunas reservas',
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