// File: api/submit-accommodation.js

import { createClient } from '@supabase/supabase-js';
import { parseStringPromise } from 'xml2js';

// Función para capitalizar la primera letra de cada palabra
function capitalizeWords(str) {
    if (!str) return str;
    return str.toLowerCase().split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

// Función para convertir email a minúsculas
function normalizeEmail(email) {
    return email ? email.toLowerCase() : email;
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        // Responder OK a preflight
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        let xml = req.body;
        if (typeof xml !== 'string') {
            // Si no es string, intenta leerlo como stream (Node.js/Vercel)
            xml = await new Promise((resolve, reject) => {
                let data = '';
                req.setEncoding('utf8');
                req.on('data', chunk => data += chunk);
                req.on('end', () => resolve(data));
                req.on('error', reject);
            });
        }
        const parsed = await parseStringPromise(xml, { explicitArray: false });

        const solicitud = parsed['ns2:peticion'].solicitud;
        const comunicacion = solicitud.comunicacion;
        const contrato = comunicacion.contrato;
        const personas = Array.isArray(comunicacion.persona) ? comunicacion.persona : [comunicacion.persona];
        const vehiculos = Array.isArray(comunicacion.vehiculo) ? comunicacion.vehiculo : [comunicacion.vehiculo];

        // Insertar en accommodation_requests
        const { data: request, error: insertError } = await supabase
            .from('accommodation_requests')
            .insert({
                establishment_code: solicitud.codigoEstablecimiento,
                contract_reference: contrato.referencia,
                contract_date: contrato.fechaContrato,
                check_in: contrato.fechaEntrada,
                check_out: contrato.fechaSalida,
                num_guests: contrato.numPersonas,
                num_rooms: contrato.numHabitaciones,
                internet: contrato.internet === 'true',
                payment_type: contrato.pago?.tipoPago || null,
                user_id: solicitud.version
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // Insertar en guests
        for (const persona of personas) {
            await supabase.from('guests').insert({
                request_id: request.id,
                role: persona.rol || null,
                first_name: capitalizeWords(persona.nombre),
                last_name1: capitalizeWords(persona.apellido1),
                last_name2: capitalizeWords(persona.apellido2),
                document_type: persona.tipoDocumento || null,
                document_number: persona.numeroDocumento || null,
                document_support: persona.soporteDocumento || null,
                birth_date: persona.fechaNacimiento || null,
                address: persona.direccion?.direccion || null,
                city_code: persona.direccion?.codigoMunicipio || null,
                city_name: persona.direccion?.nombreMunicipio || null,
                postal_code: persona.direccion?.codigoPostal || null,
                country: persona.direccion?.pais || null,
                phone: persona.telefono || null,
                email: normalizeEmail(persona.correo),
                main_guest: persona.mainGuest === 'true',
                user_id: solicitud.version
            });
        }

        for (const vehiculo of vehiculos) {
            await supabase.from('vehicles').insert({
                request_id: request.id,
                license_plate: vehiculo,
                user_id: solicitud.version
            });
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
}
