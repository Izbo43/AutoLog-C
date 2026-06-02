<?php
/**
 * GET /api/cars_get.php?id=123
 * Retorna um carro específico, com dados do dono inclusos.
 * Dados privados (placa/renavam/chassi/documentacao) só vão para o dono.
 * Requer login.
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/db.php';

require_method('GET');
$meId = require_login();

$id = (int)($_GET['id'] ?? 0);
if ($id <= 0) json_err('ID inválido.', 400, 'ERR_ID');

$stmt = db()->prepare(
   'SELECT c.id, c.usuario_id,
           c.modelo, c.descricao, c.fabricante, c.ano,
           c.cidade, c.estado, c.combustivel, c.quilometragem,
           c.cambio, c.cor, c.motor,
           c.placa, c.renavam, c.chassi, c.documentacao,
           c.foto_capa, c.fotos_extra,
           DATE_FORMAT(c.criado_em, "%d/%m/%Y") AS data_cadastro,
           u.username, u.nome_display, u.foto_perfil, u.sobre
    FROM carros c
    JOIN usuarios u ON u.id = c.usuario_id
    WHERE c.id = ?
      AND c.deleted_at IS NULL
      AND u.deleted_at IS NULL
    LIMIT 1'
);
$stmt->execute([$id]);
$car = $stmt->fetch();

if (!$car) json_err('Carro não encontrado.', 404, 'ERR_CAR_NOT_FOUND');

$isOwner = ((int)$car['usuario_id']) === $meId;

// remove campos privados se não for dono
if (!$isOwner) {
    unset($car['placa'], $car['renavam'], $car['chassi'], $car['documentacao']);
}

// normalização
$car['id']            = (int)$car['id'];
$car['usuario_id']    = (int)$car['usuario_id'];
$car['ano']           = $car['ano'] === null ? null : (int)$car['ano'];
$car['quilometragem'] = $car['quilometragem'] === null ? null : (int)$car['quilometragem'];

// fotos_extra é JSON
$car['fotos_extra'] = !empty($car['fotos_extra'])
    ? (json_decode($car['fotos_extra'], true) ?: [])
    : [];

// separa o objeto "owner" para o frontend
$owner = [
    'id'            => (int)$car['usuario_id'],
    'username'      => $car['username'],
    'nome_display'  => $car['nome_display'],
    'foto_perfil'   => $car['foto_perfil'],
    'sobre'         => $car['sobre'],
];
unset($car['username'], $car['nome_display'], $car['foto_perfil'], $car['sobre']);

json_ok([
    'car'      => $car,
    'owner'    => $owner,
    'is_owner' => $isOwner,
]);
