function doisDigitos(valor) {
  return String(valor).padStart(2, '0');
}

function dataLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
};

function validarData(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ''))) return false;
  const [ano, mes, dia] = String(valor).split('-').map(Number);
  const d = new Date(ano, mes - 1, dia);
  return d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia;
}

function formatarDataBR(valor) {
  if (!validarData(valor)) return '';
  const [ano, mes, dia] = String(valor).split('-');
  return `${dia}/${mes}/${ano}`;
}

module.exports = { dataLocal, validarData, formatarDataBR };
