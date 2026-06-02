<?php
/**
 * POST /api/cars_delete.php
 * Soft delete de um carro do usuário logado.
 *
 * Body JSON: { car_id, confirma: true }
 *
 * Efeito: carros.deleted_at = NOW()
 *   - O carro some de buscas, listagens, perfil e página de detalhes.
 *   - Posts daquele carro deixam de aparecer (posts_list checa carro ativo).
 *
 * Diferente do delete da conta, NÃO exigimos email/senha porque o impacto
 * é menor (apenas o carro) e a sessão já autentica o usuário. Exigimos
 * apenas a confirmação explícita via checkbox no frontend.
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/db.php';

require_method('POST');
$meId = require_login();

$in       = read_json_body();
$carId    = (int)($in['car_id'] ?? 0);
$confirma = !empty($in['confirma']);

if ($carId <= 0) {
    json_err('car_id inválido.', 400, 'ERR_CAR_ID');
}
if (!$confirma) {
    json_err('Confirmação de exclusão ausente.', 400, 'ERR_NOT_CONFIRMED');
}

$pdo = db();

/* Carrega e confere propriedade */
$stmt = $pdo->prepare('SELECT id, usuario_id, modelo FROM carros
                       WHERE id = ? AND deleted_at IS NULL LIMIT 1');
$stmt->execute([$carId]);
$car = $stmt->fetch();
if (!$car) json_err('Carro não encontrado.', 404, 'ERR_CAR_NOT_FOUND');
if ((int)$car['usuario_id'] !== $meId) {
    json_err('Você só pode excluir carros que são seus.', 403, 'ERR_NOT_OWNER');
}

/* Soft delete */
$stmt = $pdo->prepare('UPDATE carros SET deleted_at = NOW()
                       WHERE id = ? AND deleted_at IS NULL');
$stmt->execute([$carId]);

json_ok([
    'id'      => $carId,
    'modelo'  => $car['modelo'],
    'message' => 'Carro excluído com sucesso.',
]);
