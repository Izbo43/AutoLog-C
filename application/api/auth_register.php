<?php
/**
 * POST /api/auth_register.php
 * Cadastra um novo usuário com TODOS os campos do PDF p.4.
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/db.php';

require_method('POST');

$in = read_json_body();

// ── EXTRAÇÃO E SANITIZAÇÃO ─────────────────────────────────────
$username     = s($in['username']     ?? '', 50);
$nome_display = s($in['nome_display'] ?? '', 100);
$nome_completo= s($in['nome_completo']?? '', 150);
$email        = strtolower(s($in['email'] ?? '', 150));
$senha        = (string)($in['senha']         ?? '');
$senha2       = (string)($in['senha_confirma']?? '');
$sobre        = s($in['sobre']        ?? '', 500);
$cpf_cnpj     = digits_only($in['cpf_cnpj'] ?? '');
$telefone     = digits_only($in['telefone'] ?? '');
$telefone2    = digits_only($in['telefone2']?? '');
$data_nasc    = s($in['data_nasc']    ?? '', 10);
$cep          = digits_only($in['cep'] ?? '');
$rua          = s($in['rua']          ?? '', 200);
$numero       = s($in['numero']       ?? '', 20);
$bairro       = s($in['bairro']       ?? '', 100);
$cidade       = s($in['cidade']       ?? '', 100);
$estado       = strtoupper(s($in['estado'] ?? '', 2));
$foto_perfil  = (string)($in['foto_perfil'] ?? '');
$foto_banner  = (string)($in['foto_banner'] ?? '');

// ── VALIDAÇÕES ────────────────────────────────────────────────
$obrig = compact('username','nome_display','nome_completo','email','senha','senha2',
                 'cpf_cnpj','telefone','data_nasc','cep','rua','numero','bairro','cidade','estado');
foreach ($obrig as $campo => $val) {
    if ($val === '' || $val === null) {
        json_err("Campo obrigatório ausente: {$campo}.", 400, 'ERR_FIELD_REQUIRED');
    }
}

if (!is_valid_username($username)) {
    json_err('Username inválido. Use 3-30 caracteres: letras, números, _ ou .', 400, 'ERR_USERNAME');
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_err('Email inválido.', 400, 'ERR_EMAIL');
}

if (!is_strong_password($senha)) {
    json_err('Senha fraca: mínimo 8 caracteres, 1 maiúscula, 1 número e 1 símbolo.', 400, 'ERR_PASSWORD');
}
if ($senha !== $senha2) {
    json_err('As senhas não coincidem.', 400, 'ERR_PASSWORD_MATCH');
}

if (!is_valid_cpf_or_cnpj($cpf_cnpj)) {
    json_err('CPF/CNPJ inválido.', 400, 'ERR_CPF');
}

if (strlen($telefone) < 10 || strlen($telefone) > 11) {
    json_err('Telefone inválido (use 10 ou 11 dígitos, com DDD).', 400, 'ERR_PHONE');
}

// Data de nascimento (YYYY-MM-DD ou DD/MM/YYYY)
$nasc_iso = null;
if (preg_match('#^(\d{2})/(\d{2})/(\d{4})$#', $data_nasc, $m)) {
    $nasc_iso = "{$m[3]}-{$m[2]}-{$m[1]}";
} elseif (preg_match('#^\d{4}-\d{2}-\d{2}$#', $data_nasc)) {
    $nasc_iso = $data_nasc;
}
if (!$nasc_iso || !strtotime($nasc_iso)) {
    json_err('Data de nascimento inválida.', 400, 'ERR_BIRTHDATE');
}

if (strlen($cep) !== 8) {
    json_err('CEP inválido (8 dígitos).', 400, 'ERR_CEP');
}

if (strlen($estado) !== 2) {
    json_err('UF inválida (use 2 letras).', 400, 'ERR_UF');
}

// ── PERSISTÊNCIA ──────────────────────────────────────────────
$pdo = db();

// unicidade
$stmt = $pdo->prepare('SELECT id FROM usuarios WHERE LOWER(username) = LOWER(?) AND deleted_at IS NULL LIMIT 1');
$stmt->execute([$username]);
if ($stmt->fetch()) json_err('Este nome de usuário já está em uso.', 409, 'ERR_USERNAME_TAKEN');

$stmt = $pdo->prepare('SELECT id FROM usuarios WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL LIMIT 1');
$stmt->execute([$email]);
if ($stmt->fetch()) json_err('Este email já está cadastrado.', 409, 'ERR_EMAIL_TAKEN');

$stmt = $pdo->prepare('SELECT id FROM usuarios WHERE cpf_cnpj = ? AND deleted_at IS NULL LIMIT 1');
$stmt->execute([$cpf_cnpj]);
if ($stmt->fetch()) json_err('Este CPF/CNPJ já está cadastrado.', 409, 'ERR_CPF_TAKEN');

// fallback se o usuário não enviou avatar
if ($foto_perfil === '') {
    $foto_perfil = 'https://api.dicebear.com/7.x/bottts/svg?seed=' . urlencode($username) . '&backgroundColor=1a1a1f';
}

$senha_hash = password_hash($senha, PASSWORD_BCRYPT);

$sql = 'INSERT INTO usuarios
        (username, nome_display, nome_completo, email, senha_hash,
         cpf_cnpj, telefone, telefone2, data_nasc, sobre,
         foto_perfil, foto_banner,
         cep, rua, numero, bairro, cidade, estado)
        VALUES
        (:username, :nome_display, :nome_completo, :email, :senha_hash,
         :cpf_cnpj, :telefone, :telefone2, :data_nasc, :sobre,
         :foto_perfil, :foto_banner,
         :cep, :rua, :numero, :bairro, :cidade, :estado)';

$stmt = $pdo->prepare($sql);
$stmt->execute([
    ':username'      => $username,
    ':nome_display'  => $nome_display,
    ':nome_completo' => $nome_completo,
    ':email'         => $email,
    ':senha_hash'    => $senha_hash,
    ':cpf_cnpj'      => $cpf_cnpj,
    ':telefone'      => $telefone,
    ':telefone2'     => $telefone2 ?: null,
    ':data_nasc'     => $nasc_iso,
    ':sobre'         => $sobre,
    ':foto_perfil'   => $foto_perfil,
    ':foto_banner'   => $foto_banner ?: null,
    ':cep'           => $cep,
    ':rua'           => $rua,
    ':numero'        => $numero,
    ':bairro'        => $bairro,
    ':cidade'        => $cidade,
    ':estado'        => $estado,
]);

$newId = (int)$pdo->lastInsertId();

// auto-login após cadastro
session_regenerate_id(true);
$_SESSION['user_id']  = $newId;
$_SESSION['username'] = $username;

json_ok([
    'id'       => $newId,
    'username' => $username,
    'message'  => 'Cadastro concluído!',
], 201);
