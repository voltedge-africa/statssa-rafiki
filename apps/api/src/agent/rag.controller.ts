import { BadRequestException, Controller, Get, NotFoundException, Query } from "@nestjs/common";
import { Public } from "../auth/public.decorator.ts";
import { retrieveDocument } from "./rag/document.ts";

@Controller("api/rag")
@Public()
export class RagController {
  @Get("document")
  async document(@Query("source") source?: string) {
    if (!source) throw new BadRequestException("source is required");
    const document = await retrieveDocument(source);
    if (!document) throw new NotFoundException(`No indexed document for source "${source}"`);
    return document;
  }
}
