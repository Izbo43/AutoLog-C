<?php
/**
 * POST /api/cars_create.php
 * Cria um novo carro vinculado ao usuário logado.
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/db.php';

require_method('POST');
$meId = require_login();

$in = read_json_body();

$modelo        = s($in['modelo']        ?? '', 150);
$descricao     = s($in['descricao']     ?? '', 4000);
$placa         = strtoupper(s($in['placa']      ?? '', 10));
$renavam       = digits_only($in['renavam']     ?? '');
$chassi        = strtoupper(s($in['chassi']     ?? '', 17));
$fabricante    = s($in['fabricante']    ?? '', 100);
$ano           = (int)($in['ano']       ?? 0);
$cidade        = s($in['cidade']        ?? '', 100);
$estado        = strtoupper(s($in['estado'] ?? '', 2));
$combustivel   = s($in['combustivel']   ?? '', 30);
$quilometragem = (int)preg_replace('/\D/', '', (string)($in['km'] ?? 0));
$cambio        = s($in['cambio']        ?? '', 30);
$cor           = s($in['cor']           ?? '', 50);
$motor         = s($in['motor']         ?? '', 80);
$documentacao  = s($in['documentacao']  ?? '', 4000);
$foto_capa     = (string)($in['foto']        ?? '');
$fotos_extra   = $in['fotos_extra'] ?? [];

// ── VALIDAÇÕES ────────────────────────────────────────────────
$obrig = [
    'modelo' => $modelo, 'descricao' => $descricao,
    'placa' => $placa, 'renavam' => $renavam, 'chassi' => $chassi,
    'fabricante' => $fabricante, 'cidade' => $cidade, 'estado' => $estado,
    'combustivel' => $combustivel, 'cor' => $cor, 'motor' => $motor,
    'documentacao' => $documentacao,
];
foreach ($obrig as $k => $v) {
    if ($v === '' || $v === null) {
        json_err("Campo obrigatório ausente: {$k}.", 400, 'ERR_FIELD_REQUIRED');
    }
}
if ($ano < 1900 || $ano > 2100) json_err('Ano inválido.', 400, 'ERR_YEAR');
if ($quilometragem < 0)          json_err('Quilometragem inválida.', 400, 'ERR_KM');
if (strlen($chassi) < 11)        json_err('Chassi inválido (mín. 11 caracteres).', 400, 'ERR_CHASSI');
if (strlen($renavam) < 9)        json_err('RENAVAM inválido.', 400, 'ERR_RENAVAM');

$enumComb = ['Gasolina','Etanol','Flex','Diesel','Elétrico','Híbrido','GNV'];
if (!in_array($combustivel, $enumComb, true)) json_err('Combustível inválido.', 400, 'ERR_FUEL');

$enumCambio = ['Manual','Automático','CVT','Automatizado','Dupla embreagem'];
if ($cambio !== '' && !in_array($cambio, $enumCambio, true)) $cambio = null;

$pdo = db();

// placa única no banco (regra opcional, comum em sistemas reais)
$stmt = $pdo->prepare('SELECT id FROM carros WHERE placa = ? AND deleted_at IS NULL LIMIT 1');
$stmt->execute([$placa]);
if ($stmt->fetch()) json_err('Já existe um carro com esta placa.', 409, 'ERR_PLATE_TAKEN');

$sql = 'INSERT INTO carros
        (usuario_id, modelo, descricao, fabricante, ano,
         placa, renavam, chassi,
         cidade, estado, combustivel, quilometragem, cambio, cor, motor, documentacao,
         foto_capa, fotos_extra)
        VALUES
        (:usuario_id, :modelo, :descricao, :fabricante, :ano,
         :placa, :renavam, :chassi,
         :cidade, :estado, :combustivel, :km, :cambio, :cor, :motor, :documentacao,
         :foto_capa, :fotos_extra)';

$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':usuario_id'   => $meId,
    ':modelo'       => $modelo,
    ':descricao'    => $descricao,
    ':fabricante'   => $fabricante,
    ':ano'          => $ano,
    ':placa'        => $placa,
    ':renavam'      => $renavam,
    ':chassi'       => $chassi,
    ':cidade'       => $cidade,
    ':estado'       => $estado,
    ':combustivel'  => $combustivel,
    ':km'           => $quilometragem,
    ':cambio'       => $cambio ?: null,
    ':cor'          => $cor,
    ':motor'        => $motor,
    ':documentacao' => $documentacao,
    ':foto_capa'    => $foto_capa ?: null,
    ':fotos_extra'  => is_array($fotos_extra) ? json_encode($fotos_extra, JSON_UNESCAPED_UNICODE) : null,
]);

json_ok(['id' => (int)$pdo->lastInsertId(), 'modelo' => $modelo], 201);
