import PDFDocument from 'pdfkit';
import { getSupabaseClient } from './utils/supabaseClient.js';

export default async function handler(req, res) {
  const supabase = getSupabaseClient(req);
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.split(' ')[1];
  const { data: { user } } = await supabase.auth.getUser(token);

  if (!user) {
    return res.status(450).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Account ID is required' });
  }

  try {
    // Get expense account with all related data
    const { data: account, error } = await supabase
      .from('expense_accounts')
      .select(`
        *,
        accommodation_requests (
          id,
          short_id,
          check_in,
          check_out,
          establishment_code,
          accommodations (
            name,
            accommodation_code
          )
        ),
        guests (
          first_name,
          last_name1,
          last_name2,
          document_type,
          document_number,
          address,
          city_name,
          postal_code,
          country,
          email,
          phone
        ),
        billing_companies (
          company_name,
          tax_id,
          address,
          city,
          postal_code,
          country,
          email,
          phone
        ),
        expense_items (
          id,
          date,
          description,
          quantity,
          unit_price,
          total_price,
          expense_categories (
            name
          )
        ),
        expense_payments (
          id,
          payment_date,
          amount,
          payment_method,
          payment_method_detail,
          reference
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Check if account is settled
    if (account.status !== 'settled') {
      return res.status(400).json({ error: 'Cannot generate invoice for unsettled account' });
    }

    // Get user info for the invoice header
    const { data: userData } = await supabase
      .from('users')
      .select('company_name, email')
      .eq('user_id', account.user_id)
      .single();

    // Generate PDF
    const doc = new PDFDocument({ 
      size: 'A4',
      margin: 50,
      info: {
        Title: `Factura ${account.accommodation_requests?.short_id || account.id}`,
        Author: userData?.company_name || 'Puertauno'
      }
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=factura-${account.accommodation_requests?.short_id || account.id}.pdf`);

    // Pipe PDF to response
    doc.pipe(res);

    // Helper functions
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    const formatDate = (dateString) => {
      if (!dateString) return '-';
      return new Date(dateString).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    const formatDateTime = (dateString) => {
      if (!dateString) return '-';
      return new Date(dateString).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    // Colors
    const primaryColor = '#1a365d';
    const secondaryColor = '#4a5568';
    const accentColor = '#3182ce';

    // Header
    doc.fontSize(24)
       .fillColor(primaryColor)
       .text('FACTURA', 50, 50, { align: 'right' });

    doc.fontSize(10)
       .fillColor(secondaryColor)
       .text(`Nº: ${account.accommodation_requests?.short_id || account.id}`, 50, 80, { align: 'right' })
       .text(`Fecha: ${formatDate(new Date())}`, 50, 95, { align: 'right' });

    // Company info (issuer)
    doc.fontSize(14)
       .fillColor(primaryColor)
       .text(userData?.company_name || 'Establecimiento', 50, 50);
    
    if (account.accommodation_requests?.accommodations?.name) {
      doc.fontSize(10)
         .fillColor(secondaryColor)
         .text(account.accommodation_requests.accommodations.name, 50, 70);
    }

    // Horizontal line
    doc.moveTo(50, 120)
       .lineTo(545, 120)
       .strokeColor('#e2e8f0')
       .stroke();

    // Billing info
    let yPos = 140;
    
    doc.fontSize(12)
       .fillColor(primaryColor)
       .text('FACTURAR A:', 50, yPos);
    
    yPos += 20;

    if (account.billing_companies) {
      // Bill to company
      const company = account.billing_companies;
      doc.fontSize(11)
         .fillColor('#000')
         .text(company.company_name, 50, yPos);
      yPos += 15;
      
      if (company.tax_id) {
        doc.fontSize(10)
           .fillColor(secondaryColor)
           .text(`CIF/NIF: ${company.tax_id}`, 50, yPos);
        yPos += 12;
      }
      
      if (company.address) {
        doc.text(company.address, 50, yPos);
        yPos += 12;
      }
      
      const cityLine = [company.postal_code, company.city, company.country].filter(Boolean).join(', ');
      if (cityLine) {
        doc.text(cityLine, 50, yPos);
        yPos += 12;
      }
      
      if (company.email) {
        doc.text(company.email, 50, yPos);
        yPos += 12;
      }
    } else if (account.guests) {
      // Bill to guest
      const guest = account.guests;
      const guestName = [guest.first_name, guest.last_name1, guest.last_name2].filter(Boolean).join(' ');
      
      doc.fontSize(11)
         .fillColor('#000')
         .text(guestName, 50, yPos);
      yPos += 15;
      
      if (guest.document_number) {
        doc.fontSize(10)
           .fillColor(secondaryColor)
           .text(`${guest.document_type || 'Doc'}: ${guest.document_number}`, 50, yPos);
        yPos += 12;
      }
      
      if (guest.address) {
        doc.text(guest.address, 50, yPos);
        yPos += 12;
      }
      
      const cityLine = [guest.postal_code, guest.city_name, guest.country].filter(Boolean).join(', ');
      if (cityLine) {
        doc.text(cityLine, 50, yPos);
        yPos += 12;
      }
      
      if (guest.email) {
        doc.text(guest.email, 50, yPos);
        yPos += 12;
      }
    }

    // Stay info on the right
    const stayYPos = 140;
    doc.fontSize(12)
       .fillColor(primaryColor)
       .text('ESTANCIA:', 350, stayYPos);
    
    doc.fontSize(10)
       .fillColor(secondaryColor)
       .text(`Check-in: ${formatDate(account.accommodation_requests?.check_in)}`, 350, stayYPos + 20)
       .text(`Check-out: ${formatDate(account.accommodation_requests?.check_out)}`, 350, stayYPos + 35);

    // Items table
    yPos = Math.max(yPos, stayYPos + 60) + 30;

    // Table header
    doc.fillColor('#f7fafc')
       .rect(50, yPos, 495, 25)
       .fill();

    doc.fontSize(9)
       .fillColor(primaryColor)
       .text('FECHA', 55, yPos + 8)
       .text('CONCEPTO', 120, yPos + 8)
       .text('CANT.', 350, yPos + 8, { width: 40, align: 'right' })
       .text('PRECIO', 400, yPos + 8, { width: 60, align: 'right' })
       .text('TOTAL', 470, yPos + 8, { width: 70, align: 'right' });

    yPos += 25;

    // Table rows
    if (account.expense_items && account.expense_items.length > 0) {
      account.expense_items.forEach((item, index) => {
        // Check if we need a new page
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }

        // Alternate row background
        if (index % 2 === 0) {
          doc.fillColor('#fafafa')
             .rect(50, yPos, 495, 20)
             .fill();
        }

        const description = item.description || item.expense_categories?.name || '-';

        doc.fontSize(9)
           .fillColor('#000')
           .text(formatDateTime(item.date).split(',')[0], 55, yPos + 5, { width: 60 })
           .text(description, 120, yPos + 5, { width: 220 })
           .text(item.quantity.toString(), 350, yPos + 5, { width: 40, align: 'right' })
           .text(formatCurrency(parseFloat(item.unit_price)), 400, yPos + 5, { width: 60, align: 'right' })
           .text(formatCurrency(parseFloat(item.total_price)), 470, yPos + 5, { width: 70, align: 'right' });

        yPos += 20;
      });
    } else {
      doc.fontSize(10)
         .fillColor(secondaryColor)
         .text('No hay gastos registrados', 55, yPos + 5);
      yPos += 20;
    }

    // Total line
    yPos += 10;
    doc.moveTo(350, yPos)
       .lineTo(545, yPos)
       .strokeColor('#e2e8f0')
       .stroke();

    yPos += 10;
    doc.fontSize(12)
       .fillColor(primaryColor)
       .text('TOTAL:', 350, yPos, { width: 110, align: 'right' })
       .fillColor('#000')
       .text(formatCurrency(parseFloat(account.total_amount) || 0), 470, yPos, { width: 70, align: 'right' });

    // Payments section
    if (account.expense_payments && account.expense_payments.length > 0) {
      yPos += 40;

      // Check if we need a new page
      if (yPos > 650) {
        doc.addPage();
        yPos = 50;
      }

      doc.fontSize(12)
         .fillColor(primaryColor)
         .text('PAGOS REALIZADOS', 50, yPos);
      
      yPos += 20;

      const paymentMethodLabels = {
        cash: 'Efectivo',
        card: 'Tarjeta',
        transfer: 'Transferencia',
        other: 'Otro'
      };

      account.expense_payments.forEach((payment) => {
        const methodLabel = paymentMethodLabels[payment.payment_method] || payment.payment_method;
        const detail = payment.payment_method_detail ? ` (${payment.payment_method_detail})` : '';
        
        doc.fontSize(9)
           .fillColor(secondaryColor)
           .text(`${formatDateTime(payment.payment_date)} - ${methodLabel}${detail}`, 50, yPos)
           .fillColor('#38a169')
           .text(formatCurrency(parseFloat(payment.amount)), 470, yPos, { width: 70, align: 'right' });
        
        yPos += 15;
      });

      yPos += 10;
      doc.fontSize(11)
         .fillColor(primaryColor)
         .text('Total pagado:', 350, yPos, { width: 110, align: 'right' })
         .fillColor('#38a169')
         .text(formatCurrency(parseFloat(account.paid_amount) || 0), 470, yPos, { width: 70, align: 'right' });
    }

    // Footer - position it after the content with some spacing
    // A4 page height is 842 points, with 50 margin = 792 usable
    // Footer needs about 30 points of space
    yPos += 40;
    
    // If footer would go beyond page, add it at current position
    // Otherwise place it at the bottom of the current page
    const pageBottom = 792; // 842 - 50 margin
    const footerY = Math.min(yPos, pageBottom - 30);
    
    doc.fontSize(8)
       .fillColor(secondaryColor)
       .text('Gracias por su estancia', 50, footerY, { align: 'center', width: 495 })
       .text(`Documento generado el ${formatDateTime(new Date())}`, 50, footerY + 12, { align: 'center', width: 495 });

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('Error generating invoice:', error);
    return res.status(500).json({ error: error.message });
  }
}



