"""Configurable text chunking for knowledge base vectorization.

Supports:
- Separator-based recursive splitting (like LangChain RecursiveCharacterTextSplitter)
- Preprocessing rules (whitespace, URLs)
- Parent-child mode (large parent chunks containing smaller child chunks)
"""

import re
from typing import Optional

from app.schema.knowledge import PreprocessingRules, VectorizationConfig


def preprocess_text(text: str, rules: PreprocessingRules) -> str:
    """Apply preprocessing rules to text before chunking."""
    if not text or not text.strip():
        return ""
    text = text.strip()
    if rules.remove_extra_whitespace:
        # Collapse multiple whitespace (spaces, newlines, tabs) into single space
        text = re.sub(r"\s+", " ", text)
    if rules.remove_urls:
        # Remove URLs (http, https)
        text = re.sub(
            r"https?://[^\s]+",
            "",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(r"\s+", " ", text).strip()
    return text


def _recursive_chunk(
    text: str,
    separators: list[str],
    chunk_size: int,
    chunk_overlap: int,
) -> list[dict]:
    """
    Recursively split text by separators.

    Returns list of {"text": str, "parent_text": None, "parent_index": None}.
    """
    if not text or len(text.strip()) < 2:
        return []

    result: list[dict] = []
    separator = separators[0] if separators else ""
    next_seps = separators[1:] if len(separators) > 1 else []

    if not separator:
        # No more separators: split by chunk_size with overlap
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            chunk = text[start:end].strip()
            if chunk:
                result.append({
                    "text": chunk,
                    "parent_text": None,
                    "parent_index": None,
                })
            start = end - chunk_overlap if end < len(text) else len(text)
        return result

    # Split by current separator
    parts = text.split(separator)
    good_splits: list[str] = []
    for i, part in enumerate(parts):
        if part.strip():
            if i < len(parts) - 1:
                good_splits.append(part.strip() + separator)
            else:
                good_splits.append(part.strip())

    current_chunk = ""
    for split in good_splits:
        if len(split) > chunk_size and next_seps:
            # This split is too large, recurse with next separator
            sub_chunks = _recursive_chunk(split, next_seps, chunk_size, chunk_overlap)
            for sc in sub_chunks:
                if current_chunk.strip():
                    result.append({
                        "text": current_chunk.strip(),
                        "parent_text": None,
                        "parent_index": None,
                    })
                    current_chunk = ""
                if sc["text"]:
                    result.append(sc)
        elif len(current_chunk) + len(split) <= chunk_size:
            current_chunk += split
        else:
            if current_chunk.strip():
                result.append({
                    "text": current_chunk.strip(),
                    "parent_text": None,
                    "parent_index": None,
                })
            if chunk_overlap > 0 and current_chunk:
                overlap_start = max(0, len(current_chunk) - chunk_overlap)
                current_chunk = current_chunk[overlap_start:] + split
            else:
                current_chunk = split
    if current_chunk.strip():
        result.append({
            "text": current_chunk.strip(),
            "parent_text": None,
            "parent_index": None,
        })
    return result


def _parent_child_chunk(
    text: str, config: VectorizationConfig
) -> list[dict]:
    """
    Parent-child mode: first split into large parent chunks,
    then split each parent into smaller child chunks.

    Returns list of child chunks with parent_text and parent_index.
    """
    if not text or len(text.strip()) < 2:
        return []

    parent_size = config.parent_chunk_size
    child_size = config.chunk_size
    overlap = config.chunk_overlap
    separators = config.separators or ["\n\n", "\n"]

    # First, get parent chunks (large chunks)
    parent_chunks = _recursive_chunk(
        text,
        separators,
        parent_size,
        max(overlap // 2, 0),
    )

    result: list[dict] = []
    for p_idx, parent_info in enumerate(parent_chunks):
        parent_text = parent_info["text"]
        # Split parent into child chunks
        child_chunks = _recursive_chunk(
            parent_text,
            separators,
            child_size,
            overlap,
        )
        for c in child_chunks:
            result.append({
                "text": c["text"],
                "parent_text": parent_text,
                "parent_index": p_idx,
            })
    return result


def chunk_text_with_config(
    text: str,
    config: VectorizationConfig,
) -> list[dict]:
    """
    Split text into chunks using configurable strategy.

    Args:
        text: Raw text to chunk.
        config: VectorizationConfig with chunk_size, overlap, separators, etc.

    Returns:
        List of {"text": str, "parent_text": str|None, "parent_index": int|None}.
        For normal mode: parent_text and parent_index are None.
        For parent_child_mode: parent_text is the parent chunk, parent_index is its index.
    """
    if not text or len(text.strip()) < 2:
        return []

    text = preprocess_text(text, config.preprocessing_rules)
    if not text:
        return []

    separators = config.separators if config.separators else ["\n\n", "\n"]
    chunk_size = config.chunk_size
    chunk_overlap = config.chunk_overlap

    if config.parent_child_mode:
        return _parent_child_chunk(text, config)

    return _recursive_chunk(
        text,
        separators,
        chunk_size,
        chunk_overlap,
    )
