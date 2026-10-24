"use client";
/** Item Size Master — menu 291, grid 181 (textile). See `../item-attribute`. */
import { ItemAttributeMasterPage } from "../item-attribute/item-attribute-master";
import { ITEM_SIZE_SPEC } from "../item-attribute/item-attribute";

export default function ItemSizeMasterPage() {
  return <ItemAttributeMasterPage spec={ITEM_SIZE_SPEC} />;
}
