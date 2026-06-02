<?php
/**
 * POST /api/cars_update.php
 * Atualiza dados de um carro.
 *
 * REGRAS:
 *   - Só o dono do carro pode editar.
 *   - Todos os campos editáveis são OPCIONAIS — atualiza apenas o que veio.
 *   - Campos BLOQUEADOS (ignorados silenciosamente mesmo se enviados):
 *     chassi, renavam, fabricante, ano, usuario_id, id, criado_em, deleted_at.
 *   - Validação SÓ se o campo foi enviado e não vazio.
 *   - Placa: unicidade verificada entre carros ATIVOS (exceto ele próprio).
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/db.php';

require_method('POST');
$meId = require_login();

$in = read_json_body();

$carId = (int)($in['car_id'] ?? $in['id'] ?? 0);
if ($carId <= 0) json_err('car_id inválido.', 400, 'ERR_CAR_ID');

$pdo = db();

/* ── Carrega o carro atual e valida propriedade ─────────────────── */
$stmt = $pdo->prepare('SELECT * FROM carros WHERE id = ? AND deleted_at IS NULL LIMIT 1');
$stmt->execute([$carId]);
$car = $stmt->fetch();
if (!$car) json_err('Carro não encontrado.', 404, 'ERR_CAR_NOT_FOUND');

if ((int)$car['usuario_id'] !== $meId) {
    json_err('Você só pode editar carros que são seus.', 403, 'ERR_NOT_OWNER');
}


/* ── Helpers ────────────────────────────────────────────────────── */
$sent = function (string $key) use ($in): bool {
    return array_key_exists($key, $in) && $in[$key] !== null && trim((string)$in[$key]) !== '';
};
$keyPresent = function (string $key) use ($in): bool {
    return array_key_exists($key, $in);
};


$set    = [];
$params = [];


/* ── MODELO ──────────────────────────────────────────────────────── */
if ($sent('modelo')) {
    $v = s($in['modelo'], 150);
    if (strlen($v) < 2) json_err('Modelo muito curto.', 400, 'ERR_MODELO');
    $set[]             = 'modelo = :modelo';
    $params[':modelo'] = $v;
}

/* ── DESCRIÇÃO (permite limpar) ─────────────────────────────────── */
if ($keyPresent('descricao')) {
    $set[]                = 'descricao = :descricao';
    $params[':descricao'] = s($in['descricao'] ?? '', 4000);
}

/* ── PLACA (com unicidade entre ativos, exceto ele próprio) ─────── */
if ($sent('placa')) {
    $v = strtoupper(s($in['placa'], 10));
    if (strlen($v) < 6) json_err('Placa inválida.', 400, 'ERR_PLATE');

    if ($v !== strtoupper((string)$car['placa'])) {
        $chk = $pdo->prepare('SELECT id FROM carros
                              WHERE placa = ?
                                AND id <> ?
                                AND deleted_at IS NULL
                              LIMIT 1');
        $chk->execute([$v, $carId]);
        if ($chk->fetch()) json_err('Já existe outro carro com essa placa.', 409, 'ERR_PLATE_TAKEN');
    }
    $set[]            = 'placa = :placa';
    $params[':placa'] = $v;
}

/* ── LOCALIZAÇÃO ─────────────────────────────────────────────────── */
if ($sent('cidade')) {
    $set[]             = 'cidade = :cidade';
    $params[':cidade'] = s($in['cidade'], 100);
}
if ($sent('estado')) {
    $v = strtoupper(s($in['estado'], 2));
    if (strlen($v) !== 2 || !ctype_alpha($v)) {
        json_err('UF inválida (use 2 letras).', 400, 'ERR_UF');
    }
    $set[]             = 'estado = :estado';
    $params[':estado'] = $v;
}

/* ── CARACTERÍSTICAS ─────────────────────────────────────────────── */
if ($sent('combustivel')) {
    $v = s($in['combustivel'], 30);
    $enumComb = ['Gasolina','Etanol','Flex','Diesel','Elétrico','Híbrido','GNV'];
    if (!in_array($v, $enumComb, true)) {
        json_err('Combustível inválido.', 400, 'ERR_FUEL');
    }
    $set[]                  = 'combustivel = :combustivel';
    $params[':combustivel'] = $v;
}

if ($sent('km') || $sent('quilometragem')) {
    $raw = (string)($in['km'] ?? $in['quilometragem'] ?? '');
    $v   = (int)preg_replace('/\D/', '', $raw);
    if ($v < 0 || $v > 9999999) json_err('Quilometragem inválida.', 400, 'ERR_KM');
    $set[]                    = 'quilometragem = :quilometragem';
    $params[':quilometragem'] = $v;
}

/* Câmbio pode vir vazio (limpar) */
if ($keyPresent('cambio')) {
    $v = s($in['cambio'] ?? '', 30);
    $enumCambio = ['Manual','Automático','CVT','Automatizado','Dupla embreagem'];
    if ($v !== '' && !in_array($v, $enumCambio, true)) {
        json_err('Câmbio inválido.', 400, 'ERR_GEARBOX');
    }
    $set[]             = 'cambio = :cambio';
    $params[':cambio'] = $v !== '' ? $v : null;
}

if ($sent('cor')) {
    $set[]          = 'cor = :cor';
    $params[':cor'] = s($in['cor'], 50);
}

if ($sent('motor')) {
    $set[]            = 'motor = :motor';
    $params[':motor'] = s($in['motor'], 80);
}

/* ── DOCUMENTAÇÃO (permite limpar) ──────────────────────────────── */
if ($keyPresent('documentacao')) {
    $set[]                   = 'documentacao = :documentacao';
    $params[':documentacao'] = s($in['documentacao'] ?? '', 4000);
}

/* ── FOTOS ──────────────────────────────────────────────────────── */
if ($keyPresent('foto') || $keyPresent('foto_capa')) {
    $v = (string)($in['foto'] ?? $in['foto_capa'] ?? '');
    $set[]                = 'foto_capa = :foto_capa';
    $params[':foto_capa'] = $v !== '' ? $v : null;
}

if ($keyPresent('fotos_extra')) {
    $arr = $in['fotos_extra'];
    if (!is_array($arr)) $arr = [];
    if (count($arr) > 5) $arr = array_slice($arr, 0, 5);
    $set[]                  = 'fotos_extra = :fotos_extra';
    $params[':fotos_extra'] = !empty($arr) ? json_encode($arr, JSON_UNESCAPED_UNICODE) : null;
}


/* ── Nada a atualizar ───────────────────────────────────────────── */
if (empty($set)) {
    json_err('Nenhum campo para atualizar.', 400, 'ERR_NO_FIELDS');
}


/* ── UPDATE ─────────────────────────────────────────────────────── */
$params[':id'] = $carId;
$sql  = 'UPDATE carros SET ' . implode(', ', $set) . ' WHERE id = :id AND deleted_at IS NULL';
$stmt = $pdo->prepare($sql);
$stmt->execute($params);

json_ok([
    'id'      => $carId,
    'message' => 'Carro atualizado com sucesso.',
]);
