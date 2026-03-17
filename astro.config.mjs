import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

const isProd = process.env.NODE_ENV === "production";
export default defineConfig({
  site: "https://scarfbench.info",
  integrations: [
    starlight({
      title: "ScarfBench",
      description: "A Benchmark of Self-Contained Application Refactoring and Framework Migration Examples",
      customCss: ["./src/styles/docs.css"],
      head: [
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css",
          },
        },
      ],
      social: [{ icon: "github", label: "ScarfBench on GitHub", href: "https://github.com/scarfbench/benchmark" }],
      components: {
        Sidebar: "./src/components/StarlightSidebar.astro",
        SocialIcons: "./src/components/StarlightSocialIcons.astro",
      },
      sidebar: [
        {
          label: "ScarfBench",
          items: [
            { label: "Home", slug: "index" },
            { label: "Setup", slug: "installing" },
            { label: "Quickstart", slug: "quickstart" },
            { label: "Submit Solution", slug: "submit" },
          ],
        },
        { label: "Leaderboard", slug: "leaderboard" },
        {
          label: "Benchmark",
          items: [
            {
              label: "Focused Examples",
              items: [
                { label: "Overview", slug: "focused_examples" },
                {
                  label: "Business Domain",
                  items: [
                    { label: "Overview", slug: "focused_examples/business_domain" },
                    { label: "Cart", slug: "focused_examples/business_domain/cart" },
                    { label: "Converter", slug: "focused_examples/business_domain/converter" },
                    { label: "Counter", slug: "focused_examples/business_domain/counter" },
                    { label: "Hello Service", slug: "focused_examples/business_domain/helloservice" },
                    { label: "Standalone", slug: "focused_examples/business_domain/standalone" },
                  ],
                },
                {
                  label: "Dependency Injection",
                  items: [
                    { label: "Overview", slug: "focused_examples/dependency_injection" },
                    { label: "Bill Payment", slug: "focused_examples/dependency_injection/billpayment" },
                    { label: "Decorators", slug: "focused_examples/dependency_injection/decorators" },
                    { label: "Encoder", slug: "focused_examples/dependency_injection/encoder" },
                    { label: "Guess Number", slug: "focused_examples/dependency_injection/guessnumber" },
                    { label: "Producer Fields", slug: "focused_examples/dependency_injection/producerfields" },
                    { label: "Producer Methods", slug: "focused_examples/dependency_injection/producermethods" },
                    { label: "Simple Greeting", slug: "focused_examples/dependency_injection/simplegreeting" },
                  ],
                },
                {
                  label: "Infrastructure",
                  items: [
                    { label: "Overview", slug: "focused_examples/infrastructure" },
                    { label: "Concurrency Jobs", slug: "focused_examples/infrastructure/concurrency-jobs" },
                    { label: "Concurrency Task Creator", slug: "focused_examples/infrastructure/concurrency-taskcreator" },
                    { label: "EJB Async", slug: "focused_examples/infrastructure/ejb-async" },
                    { label: "EJB Interceptor", slug: "focused_examples/infrastructure/ejb-interceptor" },
                    { label: "EJB Timer Session", slug: "focused_examples/infrastructure/ejb-timersession" },
                  ],
                },
                {
                  label: "Integration",
                  items: [
                    { label: "Overview", slug: "focused_examples/integration" },
                    { label: "Batch Phone Billing", slug: "focused_examples/integration/batch-phonebilling" },
                    { label: "Batch Web Server Log", slug: "focused_examples/integration/batch-webserverlog" },
                    { label: "Connectors Trading", slug: "focused_examples/integration/connectors-trading" },
                    { label: "Connectors Traffic", slug: "focused_examples/integration/connectors-traffic" },
                    { label: "JAX-WS Hello App Client", slug: "focused_examples/integration/jaxws-hello-appclient" },
                    { label: "JAX-WS Hello Web Client", slug: "focused_examples/integration/jaxws-hello-webclient" },
                    { label: "JMS Client MDB Entity", slug: "focused_examples/integration/jms-clientmdbentity" },
                    { label: "JMS Client Session MDB", slug: "focused_examples/integration/jms-clientsessionmdb" },
                    { label: "JMS Durable Subscription", slug: "focused_examples/integration/jms-durablesubscription" },
                    { label: "JMS Simple", slug: "focused_examples/integration/jms-simple" },
                    { label: "JMS Simple Message", slug: "focused_examples/integration/jms-simplemessage" },
                    { label: "JMS Transacted Example", slug: "focused_examples/integration/jms-transactedexample" },
                    { label: "JMS Web Simple Message", slug: "focused_examples/integration/jms-websimplemessage" },
                  ],
                },
                {
                  label: "Persistence",
                  items: [
                    { label: "Overview", slug: "focused_examples/persistence" },
                    { label: "Address Book", slug: "focused_examples/persistence/address-book" },
                    { label: "Order", slug: "focused_examples/persistence/order" },
                    { label: "Roster", slug: "focused_examples/persistence/roster" },
                  ],
                },
                {
                  label: "Presentation",
                  items: [
                    { label: "Overview", slug: "focused_examples/presentation" },
                    { label: "Duke ETF", slug: "focused_examples/presentation/dukeetf" },
                    { label: "Duke ETF 2", slug: "focused_examples/presentation/dukeetf2" },
                    { label: "File Upload", slug: "focused_examples/presentation/fileupload" },
                    { label: "Hello Servlet", slug: "focused_examples/presentation/hello-servlet" },
                    { label: "JAX-RS Customer", slug: "focused_examples/presentation/jaxrs-customer" },
                    { label: "JAX-RS Hello", slug: "focused_examples/presentation/jaxrs-hello" },
                    { label: "JAX-RS RSVP", slug: "focused_examples/presentation/jaxrs-rsvp" },
                    { label: "Mood", slug: "focused_examples/presentation/mood" },
                    { label: "WebSocket Bot", slug: "focused_examples/presentation/websocketbot" },
                  ],
                },
                {
                  label: "Security",
                  items: [
                    { label: "Overview", slug: "focused_examples/security" },
                    { label: "Built-in DB Identity Store", slug: "focused_examples/security/built-in-db-identity-store" },
                    { label: "Custom Identity Store", slug: "focused_examples/security/custom-identity-store" },
                    { label: "Security Cart Secure", slug: "focused_examples/security/security-cart-secure" },
                    { label: "Security Converter Secure", slug: "focused_examples/security/security-converter-secure" },
                    { label: "Security Hello1 Form Auth", slug: "focused_examples/security/security-hello1-formauth" },
                    { label: "Security Hello2 Basic Auth", slug: "focused_examples/security/security-hello2-basicauth" },
                  ],
                },
              ],
            },
            {
              label: "Whole Applications",
              items: [
                { label: "CargoTracker", slug: "cargotracker" },
                { label: "Coffee Shop", slug: "coffee_shop" },
                { label: "DayTrader", slug: "daytrader" },
                { label: "PetClinic", slug: "petclinic" },
                { label: "RealWorld", slug: "realworld" },
              ],
            },
          ],
        },
        {
          label: "Resources",
          items: [
            { label: "Resources", slug: "resources" },
            { label: "Citation", slug: "citation" },
          ],
        },
      ],
    }),
  ],
});
