require('isomorphic-fetch');
const dotenv = require('dotenv');
const Koa = require('koa');
const next = require('next');
const { default: createShopifyAuth } = require('@shopify/koa-shopify-auth');
const { verifyRequest } = require('@shopify/koa-shopify-auth');
const { default: Shopify, ApiVersion } = require('@shopify/shopify-api');
const { Router } = require('koa-router');

dotenv.config();

Shopify.Context.initialize({
  API_KEY: process.env.SHOPIFY_API_KEY,
  API_SECRET_KEY: process.env.SHOPIFY_API_SECRET,
  SCOPES: process.env.SCOPES.split(","),
  HOST_NAME: process.env.SHOPIFY_APP_URL.replace(/https:\/\//, ""),
  API_VERSION: ApiVersion.October20,
  IS_EMBEDDED_APP: true,
  // This should be replaced with your preferred storage strategy
  SESSION_STORAGE: new Shopify.Session.MemorySessionStorage(),
  // SESSION_STORAGE: new Shopify.Session.CustomSessionStorage(
  //   storeCallback,
  //   loadCallback,
  //   deleteCallback
  // ),
});

const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const ACTIVE_SHOPIFY_SHOPS = {};


app.prepare().then(()=> {
  console.log("app.prepare")
  const server = new Koa();
  const router = new Router();
  server.keys = [Shopify.Context.API_SECRET_KEY];

  server.use(
    createShopifyAuth({
      afterAuth(ctx) {
        console.log("after auth")
        const { shop, scope } = ctx.state.shopify;
        ACTIVE_SHOPIFY_SHOPS[shop] = scope;

        if ( ACTIVE_SHOPIFY_SHOPS[shop] ) {
          console.log("after auth - shop exists")
          ctx.redirect(`https://${shop}/admin/apps`);
        } else {
          console.log("after auth - no shop")
          ctx.redirect(`/?shop=${shop}`);
        }

      },
    }),
  );

  const handleRequest = async (ctx) => {
    console.log("handleRequest")
    await handle(ctx.req, ctx.res);
    ctx.respond = false;
    ctx.res.statusCode = 200;
  };

  router.get("/", async (ctx) => {
    console.log("router.get /")
    const shop = ctx.query.shop;

    if (ACTIVE_SHOPIFY_SHOPS[shop] === undefined) {
      console.log("router.get /  --  shop undefined")
      ctx.redirect(`/auth?shop=${shop}`);
    } else {
      console.log("router.get /  --  shop exists")
      await handleRequest(ctx);
    }
  });

  router.get('(.*)', handleRequest);

  router.get("(/_next/static/.*", handleRequest);
  router.get("(/_next/webpack-hmr", handleRequest);
  router.get("(.*)", verifyRequest(), handleRequest);

  server.use(router.allowedMethods());
  server.use(router.routes());

  server.listen(port, () => {
    console.log(`> Ready on ${port}`)
  });

});