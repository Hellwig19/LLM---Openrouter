# Mock Data Generator

Aplicação para gerar massa de dados fictícia, em JSON ou SQL, para testes de banco de dados e integrações.

## Como executar

```bash
npm i
```

Crie um arquivo `.env` na raiz do projeto com a sua chave e o modelo desejado:

```env
OPENROUTER_API_KEY=sua_chave
OPENROUTER_MODEL=cohere/north-mini-code:free
```

Depois inicie o servidor:

```bash
npm start
```

Se estiver tudo certo, a aplicação sobe em `http://localhost:3000`.

## Como usar

1. Escreva os campos desejados na caixa principal.
2. Escolha o formato: `JSON` ou `SQL INSERT INTO`.
3. Defina a quantidade de registros, entre 5 e 100.
4. Clique em `Gerar saída`.

## Campos sugeridos

Use estes nomes como referência para montar sua solicitação. Você pode combinar vários deles no mesmo pedido.

### Identificação

- id
- uuid
- identificador
- codigo
- chave

### Pessoa e contato

- nome
- nome completo
- sobrenome
- email
- telefone
- celular
- cpf
- cnpj

### Endereço

- endereco
- numero
- complemento
- bairro
- cidade
- estado
- pais
- cep

### Empresa e perfil

- empresa
- cargo
- departamento
- setor
- perfil
- papel
- tipo

### Datas e controle

- data_criacao
- data_atualizacao
- data_nascimento
- created_at
- updated_at
- status
- ativo
- inativo

### Financeiro e valores

- valor
- preco
- quantidade
- saldo
- limite
- desconto
- total

### Outros campos úteis

- observacao
- descricao
- categoria
- subcategoria
- produto
- servico
- codigo_externo
- referencia
- prioridade
- nivel
- nota
- avaliacao

## Exemplos de pedido

```text
nome completo, email corporativo, data_criacao, status
```

```text
id, nome completo, cpf, telefone, cidade, estado, status
```

```text
produto, categoria, preco, quantidade, total
```

## Observações

- A quantidade máxima permitida na interface é 100 registros.
- A saída é mostrada em texto limpo para facilitar copiar e colar.
