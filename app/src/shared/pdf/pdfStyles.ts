import { StyleSheet } from '@react-pdf/renderer';

export const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 40,
    lineHeight: 1.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderBottom: '2px solid #1e40af',
    paddingBottom: 10,
  },
  headerLeft: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#1e40af',
  },
  headerRight: {
    fontSize: 9,
    color: '#6b7280',
    textAlign: 'right',
  },
  title: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 15,
    color: '#111827',
  },
  subtitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
    marginTop: 12,
    color: '#1f2937',
  },
  text: {
    fontSize: 10,
    marginBottom: 4,
    color: '#374151',
  },
  textBold: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
  },
  table: {
    marginTop: 8,
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1px solid #d1d5db',
    minHeight: 24,
    alignItems: 'center',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1e40af',
    minHeight: 28,
    alignItems: 'center',
  },
  tableHeaderCell: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    padding: 4,
  },
  tableCell: {
    fontSize: 9,
    padding: 4,
    color: '#374151',
  },
  signatureSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 50,
    paddingTop: 10,
  },
  signatureBlock: {
    width: '40%',
    alignItems: 'center',
  },
  signatureLine: {
    borderTop: '1px solid #000',
    width: '100%',
    marginTop: 40,
    marginBottom: 4,
  },
  signatureLabel: {
    fontSize: 9,
    textAlign: 'center',
    color: '#4b5563',
  },
  clausula: {
    marginBottom: 10,
  },
  clausulaTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  clausulaText: {
    fontSize: 9,
    lineHeight: 1.6,
    color: '#374151',
    textAlign: 'justify',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#9ca3af',
    textAlign: 'center',
    borderTop: '1px solid #e5e7eb',
    paddingTop: 8,
  },
  badge: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    padding: '2 6',
    borderRadius: 3,
    fontSize: 8,
  },
  badgeOk: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    padding: '2 6',
    borderRadius: 3,
    fontSize: 8,
  },
  badgeDanado: {
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    padding: '2 6',
    borderRadius: 3,
    fontSize: 8,
  },
});

export const EMPRESA = {
  nombre: 'SCL Consultores SPA',
  rut: '76.512.346-1',
};
