from app.models.schemas import ChatMessage, ChatRequest, ChatResponse


def chat(req: ChatRequest) -> ChatResponse:
    """
    PoC stub — echoes the last user message back with a canned reply.
    Wire to an LLM (Claude API) in Day 5+ of the plan.
    """
    last = req.messages[-1].content if req.messages else ""

    reply = (
        "I understand you want to: "
        f'"{last}". '
        "In the next iteration I will generate the transformation nodes for you. "
        "For now, please add nodes manually from the canvas toolbar."
    )

    return ChatResponse(
        message=ChatMessage(role="assistant", content=reply),
        suggested_nodes=None,
    )
