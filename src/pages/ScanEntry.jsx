import { Navigate, useParams, useSearchParams } from 'react-router-dom';

/// Handles the /t/:ticketNumber link printed as the QR code on every
/// citation (see QrPayloadBuilder in the enforcer app - the QR encodes
/// https://eticket.libmananpso.gov.ph/t/<ticketNumber>?c=<checksum>,
/// unique per ticket since ticketNumber itself is unique per citation).
/// This route just extracts the ticket number and checksum from the
/// URL and hands off to /login with them as query params, so the login
/// form can pre-fill the Ticket Number field automatically instead of
/// making the motorist re-type what the QR already told us.
export default function ScanEntry() {
  const { ticketNumber } = useParams();
  const [searchParams] = useSearchParams();
  const checksum = searchParams.get('c') || '';

  const query = new URLSearchParams({
    ticket: ticketNumber || '',
    ...(checksum ? { c: checksum } : {}),
  }).toString();

  return <Navigate to={`/login?${query}`} replace />;
}