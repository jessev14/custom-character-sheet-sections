const moduleID = "custom-character-sheet-sections";

// Register a module wrapper for the character sheet data retrieval
Hooks.once("ready", () => {
  libWrapper.register(
    moduleID,
    "CONFIG.Actor.sheetClasses.character['dnd5e.ActorSheet5eCharacter'].cls.prototype.getData",
    customSectionGetData,
    "WRAPPER"
  );
});

// Handle rendering of an item sheet
Hooks.on("renderItemSheet", (app, [html], appData) => {
  // Create a custom section input element
  const customSectionInput = document.createElement("div");
  customSectionInput.classList.add("form-group");
  customSectionInput.style.cssText = `
    border: 1px solid var(--faint-color);
    border-radius: 5px;
    flex-direction: column;
  `;
  customSectionInput.innerHTML = `
    <label>${game.i18n.localize(`${moduleID}.customSection`)}</label>
    <input style="text-align: left;" type="text" name="flags.${moduleID}.sectionName" value="${
    app.object.flags[moduleID]?.sectionName || ""
  }" />
  `;

  // Find the item properties section and append the custom section input
  const itemProperties = html.querySelector("div.item-properties");
  if (itemProperties) itemProperties.appendChild(customSectionInput);
});

// Handle rendering of the 5e character sheet
Hooks.on("renderActorSheet5eCharacter", (app, html, appData) => {
  // Remove "Add Item" buttons from custom sections on the character sheet
  const addButtons = html.find("a.item-create");
  addButtons.each(function () {
    // Find the first and previous items to determine the custom section
    const firstItemLi = $(this).closest("li.items-header").next("ol.item-list").find("li.item");
    const prevItemLi = $(this).closest("li.items-footer").prev("li.item");
    const firstItem = app.object.items.get(firstItemLi?.data("itemId"));
    const prevItem = app.object.items.get(prevItemLi?.data("itemId"));
    const item = firstItem || prevItem;
    const customSectionName = item?.getFlag(moduleID, "sectionName");

    // Remove the "Add Item" button if it corresponds to a custom section
    if (!customSectionName) return;
    $(this).remove();
  });
});

// Function to process and modify character sheet data
async function customSectionGetData(wrapped) {
  // Call the wrapped function to retrieve the original appData
  const data = await wrapped();

  // Define a function to process items of a specific type
  const processItemType = (type, itemsSpells, newItemType) => {
    // Extract items of the specified type, excluding classes
    const items = data[type]
      .filter((current) => !current.isclass)
      .flatMap((current) => current[itemsSpells]);

    // Filter items flagged with a custom section and get unique section names
    const customSectionItems = items.filter((i) => i.flags[moduleID]?.sectionName);
    const customSections = Array.from(
      new Set(customSectionItems.map((item) => item.flags[moduleID].sectionName))
    );

    // Remove custom section items from their original sections
    for (const section of data[type]) {
      section[itemsSpells] = section[itemsSpells].filter((i) => !customSectionItems.includes(i));
    }

    // Create new sections for custom items and add them to the character sheet data
    for (const customSection of customSections) {
      const newSection = {
        label: customSection,
        [itemsSpells]: customSectionItems.filter((i) => i.flags[moduleID].sectionName === customSection),
      };

      // Customize section properties based on the item type
      if (type === "features") {
        newSection.hasActions = true;
        newSection.isClass = false;
        newSection.dataset = { type: newItemType || "feat" };
      } else if (type === "spellbook") {
        newSection.canCreate = false;
        newSection.canPrepare = true;
        newSection.dataset = {
          "preparation.mode": "prepared",
          type: newItemType || "spell",
        };
        newSection.usesSlots = false;
      }

      // Add the new custom section to the character sheet data
      data[type].push(newSection);
    }
  };

  // Process and modify different item types
  processItemType("features", "items", "feat"); // Features
  processItemType("inventory", "items");         // Inventory
  processItemType("spellbook", "spells", "spell"); // Spellbook

  // Return the updated character sheet data for rendering
  return data;
}
