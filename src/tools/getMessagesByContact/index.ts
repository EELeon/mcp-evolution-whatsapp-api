import type { ToolRegistration } from "../../types";
import { makeJsonSchema } from "../../utils/makeJsonSchema";
import { webhookApi } from "../../utils/webhookApi";
import { type GetMessagesByContactSchema, getMessagesByContactSchema } from "./schema";

export const getMessagesByContact = async (args: GetMessagesByContactSchema) => {
  const period = args.period || "today";
  const data = await webhookApi.getMessages(period);

  if (!data?.chats) return { chats: {}, period, query: args };

  const results: Record<string, any> = {};

  for (const [jid, chat] of Object.entries(data.chats as Record<string, any>)) {
    let match = false;

    if (args.jid && jid === args.jid) {
      match = true;
    } else if (args.contactName) {
      const name = (chat.contact || "").toLowerCase();
      if (name.includes(args.contactName.toLowerCase())) {
        match = true;
      }
    }

    if (match) {
      const chatCopy = { ...chat };
      if (args.limit && chatCopy.messages) {
        chatCopy.messages = chatCopy.messages.slice(-args.limit);
      }
      results[jid] = chatCopy;
    }
  }

  return { chats: results, period, query: args };
};

export const getMessagesByContactTool: ToolRegistration<GetMessagesByContactSchema> = {
  name: "get_messages_by_contact",
  description:
    "Get WhatsApp messages for a specific contact by JID or name. Searches today's or yesterday's messages. Provide either jid (exact match) or contactName (partial, case-insensitive). Use this to check what a specific person wrote.",
  inputSchema: makeJsonSchema(getMessagesByContactSchema),
  handler: async (args: GetMessagesByContactSchema) => {
    try {
      const parsedArgs = getMessagesByContactSchema.parse(args);

      if (!parsedArgs.jid && !parsedArgs.contactName) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Provide either 'jid' or 'contactName' to search for a contact.",
            },
          ],
          isError: true,
        };
      }

      const result = await getMessagesByContact(parsedArgs);
      const chatCount = Object.keys(result.chats).length;
      const resultJson = JSON.stringify(result, null, 2);

      return {
        content: [
          {
            type: "text",
            text: chatCount > 0
              ? `Found ${chatCount} matching chat(s):\n\n${resultJson}`
              : `No messages found for ${parsedArgs.jid || parsedArgs.contactName} (${result.period}).`,
          },
        ],
      };
    } catch (error) {
      console.error("Error in getMessagesByContactTool handler:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${(error as Error).message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
