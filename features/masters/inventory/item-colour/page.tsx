"use client";
/** Item Colour Master — menu 292, grid 182 (textile). See `../item-attribute`. */
import { ItemAttributeMasterPage } from "../item-attribute/item-attribute-master";
import { ITEM_COLOUR_SPEC } from "../item-attribute/item-attribute";

export default function ItemColourMasterPage() {
  return <ItemAttributeMasterPage spec={ITEM_COLOUR_SPEC} />;
}
