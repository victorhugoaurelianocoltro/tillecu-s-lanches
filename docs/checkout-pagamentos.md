# Checkout, pedidos e pagamentos

## Implementado

- O catálogo com preços em centavos está em `functions/src/catalog.js` e é a fonte usada pelo site e pelo backend. O cliente envia somente IDs e quantidades; o servidor calcula os valores.
- A Function `api` grava pedidos no Firestore, gera uma preferência de Checkout Pro e devolve somente o link HTTPS do Mercado Pago. Pix, cartões e boleto não são excluídos; o cliente escolhe no ambiente hospedado do provedor entre as opções habilitadas para a conta do estabelecimento.
- A preferência não define `purpose: "wallet_purchase"`, parâmetro que restringe o Checkout Pro a compradores autenticados no Mercado Pago. O fluxo aceita checkout como convidado; a disponibilidade final de cada meio depende da habilitação da conta vendedora no Mercado Pago.
- Uma chave de idempotência vinculada ao conteúdo e a um token de sessão impede que tentativas repetidas criem novos pedidos/cobranças. O limite atual é de 10 pedidos por IP por hora.
- O status não é alterado pela URL de retorno. O webhook precisa passar pela validação HMAC, e o servidor consulta `/v1/payments/{id}` com o token privado antes de atualizar o pedido.
- As regras Firestore negam acesso direto de clientes a pedidos, pagamentos, tokens de idempotência e limites.
- Retirada pode ser usada sem configuração de entrega. Entrega permanece desabilitada enquanto não houver regiões atendidas e taxa configuradas no servidor.

## Ativação necessária

O checkout não está operacional em produção até completar todos estes passos. Nenhuma credencial está incluída no repositório.

1. Use um projeto Firebase próprio com faturamento Blaze habilitado, crie o banco Firestore e publique `firestore.rules`.
2. Configure um domínio HTTPS público para o Hosting e informe a URL HTTPS sem barra final em `PUBLIC_SITE_URL`.
3. No painel de integrações do Mercado Pago, crie/valide a aplicação de vendedor. Configure os eventos de pagamento do webhook para `https://SEU_DOMINIO/api/webhooks/mercadopago`.
4. Armazene as credenciais como secrets de Cloud Functions, nunca no frontend:

   ```powershell
   firebase functions:secrets:set MERCADOPAGO_ACCESS_TOKEN --project SEU_PROJECT_ID
   firebase functions:secrets:set MERCADOPAGO_WEBHOOK_SECRET --project SEU_PROJECT_ID
   ```

   O primeiro valor deve ser o Access Token da aplicação Mercado Pago; o segundo é a assinatura secreta de Webhooks exibida no painel do Mercado Pago. Digite os valores diretamente no prompt do terminal.
5. Copie `functions/.env.example` para `functions/.env.SEUPROJECT_ID` (o nome deve corresponder ao projeto Firebase) e substitua `PUBLIC_SITE_URL` pelo domínio HTTPS publicado. Entrega é opcional: só defina `DELIVERY_FEE_CENTS` e `DELIVERY_AREAS_JSON` depois que a loja confirmar taxa e bairros/cidades. Formato de `DELIVERY_AREAS_JSON`:

   ```json
   [{"neighborhood":"Centro","city":"Jandira"}]
   ```

   A taxa usa centavos inteiros, por exemplo `500` significa R$ 5,00. Não use esse exemplo como taxa real sem confirmação da loja.
6. Instale Firebase CLI, selecione seu projeto e publique:

   ```powershell
   firebase use SEU_PROJECT_ID
   firebase deploy --only firestore:rules,functions,hosting
   ```

7. Configure e teste primeiro com credenciais de teste do Mercado Pago e um domínio HTTPS de homologação. Depois de verificar webhook, valores e estados de pagamento, troque para credenciais de produção e repita a compra de ponta a ponta. Não use links de sandbox como evidência de operação real.

Para desenvolvimento, use os emuladores Firebase e mantenha secrets de teste somente em `functions/.secret.local` (arquivo ignorado pelo Git). O checkout ainda requer um site HTTPS acessível para retornar do Mercado Pago; não tente validar o redirecionamento usando localhost.

A Function está na região `southamerica-east1`; o Firebase Hosting encaminha `/api/**` para ela. `vite.config.js` encaminha `/api` ao emulador local, usando `demo-tillecus-lanches` como ID de demonstração. Para testar o redirecionamento do Mercado Pago, use um domínio HTTPS acessível; o Mercado Pago não aceita `localhost` como URL de retorno.

## Diagnóstico executado em 2026-10-14

- No navegador local, `GET http://127.0.0.1:5173/api/catalog` respondeu `502`. O proxy antigo apontava para `127.0.0.1:5001/demo-tillecus-lanches/southamerica-east1/api`, mas a porta 5001 não tinha listener.
- Não há Firebase CLI instalado, `.firebaserc`, nem `.env.<projectId>`/`.secret.local` no ambiente. `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` e `PUBLIC_SITE_URL` também não estão definidos no processo.
- O domínio antigo `https://burger-house-3d.web.app/api/catalog` respondeu `200` com HTML da versão anterior Burger House em espanhol, não JSON. Isso é o fallback SPA, não uma API funcionando.
- `https://southamerica-east1-burger-house-3d.cloudfunctions.net/api/catalog` respondeu `404`. A Function desta integração não está publicada nesse projeto/rota. Não foi possível testar credenciais, criar preferência real ou confirmar webhook.

Para desenvolvimento, rode o emulador no mesmo project ID configurado no Vite e passe `VITE_FIREBASE_PROJECT_ID=SEU_PROJECT_ID` ao iniciar `npm run dev`. Para apontar o navegador a uma Function já publicada, use `VITE_API_PROXY_TARGET=https://southamerica-east1-SEU_PROJECT_ID.cloudfunctions.net/api` antes de `npm run dev`. Sem um desses valores, o Vite agora responde `503` JSON explícito em `/api/**` em vez de mascarar a ausência do backend com `502`.

O domínio `burger-house-3d.web.app` contém o deployment antigo. Faça login e selecione o projeto Firebase correto antes de publicar; não use o project ID antigo por suposição. Após identificar o projeto do estabelecimento, os comandos são:

```powershell
npx firebase-tools login
npx firebase-tools use --add SEU_PROJECT_ID
npx firebase-tools functions:secrets:set MERCADOPAGO_ACCESS_TOKEN --project SEU_PROJECT_ID
npx firebase-tools functions:secrets:set MERCADOPAGO_WEBHOOK_SECRET --project SEU_PROJECT_ID
npx firebase-tools deploy --only firestore:rules,functions,hosting --project SEU_PROJECT_ID
```

Configure `PUBLIC_SITE_URL` no arquivo `functions/.env.SEUPROJECT_ID` com o domínio HTTPS novo e cadastre no painel Mercado Pago o webhook `https://SEU_DOMINIO/api/webhooks/mercadopago`. As credenciais devem ser digitadas apenas nos prompts do terminal/painel, nunca coladas no código ou no chat.

## Dados que a loja ainda precisa confirmar

- Taxa de entrega e lista de bairros/cidades atendidos. Sem esses valores, apenas retirada fica disponível.
- Adicionais, opções de tamanho/variação e respectivos preços. As referências enviadas não especificam adicionais; por isso nenhum foi inventado nem incluído na cobrança.
- O preparo do X-Calabresa está parcialmente ilegível na referência. Confirme se inclui bacon e ovo antes de usá-lo como informação operacional.
- Política de privacidade/retensão para nome, e-mail, telefone e endereço armazenados nos pedidos.

## Testes e limites de verificação

`npm test` cobre catálogo, cálculo de preços no servidor, região/taxa, URL e payload de preferência, HMAC, referência/valor/moeda e estados de pagamento. `npm --prefix functions test` executa os testes de domínio do backend; `npm run lint` cobre frontend e backend. Esses testes não substituem uma compra de teste com contas Mercado Pago nem uma validação em produção.

Nenhuma compra real ou integração com credenciais foi executada neste ambiente: faltam projeto Firebase, domínio público, Access Token e segredo do webhook da loja. Portanto o código está preparado para integração, mas o checkout real permanece desabilitado até a ativação acima.
