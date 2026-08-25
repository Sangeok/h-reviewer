import { EventSchemas, Inngest } from "inngest";

import type { HReviewerEvents } from "./events";

// Create a client to send and receive events
export const inngest = new Inngest({
  id: "hreviewer",
  schemas: new EventSchemas().fromRecord<HReviewerEvents>(),
});
