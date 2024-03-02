const moduleID = "custom-character-sheet-sections";

const lg = x => console.log(x);


Hooks.once('init', () => {
    game.settings.register(moduleID, 'hideEmpty', {
        name: 'Hide Empty Sections',
        scope: 'world',
        config: true,
        type: Boolean,
        default: false
    });

    const itemListControlsElement = customElements.get('item-list-controls');
    const new_applyGrouping = function () {
        if (this._controls.group) {
            const actorID = this.closest('div.sheet.actor.character').id.split('-').pop();
            const actor = game.actors.get(actorID);

            const group = this.prefs?.group !== false;
            const sections = {};
            for (const section of this.list.querySelectorAll(".items-section")) {
                sections[section.dataset.type] = section.querySelector(".item-list");
            }
            for (const item of this.list.querySelectorAll(".item")) {
                const itemID = item.dataset.itemId;
                const fItem = actor?.items.get(itemID);
                const customSection = fItem?.getFlag(moduleID, 'sectionName');
                const { ungrouped } = item.dataset;
                const grouped = customSection || item.dataset.grouped;
                const section = this.getAttribute('for') === 'features' && customSection ? sections[grouped] : sections[group ? grouped : ungrouped];
                section.appendChild(item);
            }
        }
        this._applyFilters();
        this._applySorting();
    };
    itemListControlsElement.prototype._applyGrouping = new_applyGrouping;
});

Hooks.once("ready", () => {
    libWrapper.register(moduleID, "CONFIG.Actor.sheetClasses.character['dnd5e.ActorSheet5eCharacter'].cls.prototype.getData", customSectionGetData, "WRAPPER");

    libWrapper.register(moduleID, "CONFIG.Actor.sheetClasses.character['dnd5e.ActorSheet5eCharacter2'].cls.prototype.getData", characterSheet2getData, "WRAPPER");
});


Hooks.on("renderItemSheet", (app, [html], appData) => {
    const customSectionInput = document.createElement('div');
    customSectionInput.classList.add('form-group');
    customSectionInput.style.cssText = `
        border: 1px solid var(--faint-color);
        border-radius: 5px;
        flex-direction: column;
    `;
    customSectionInput.innerHTML = `
        <label>${game.i18n.localize(`${moduleID}.customSection`)}</label>
        <input style="text-align: left;" type="text" name="flags.${moduleID}.sectionName" value="${app.object.flags[moduleID]?.sectionName || ""}" />
    `;
    const itemProperties = html.querySelector(`div.item-properties`);
    if (itemProperties) itemProperties.appendChild(customSectionInput);

    return;
});

Hooks.on("renderActorSheet5eCharacter", (app, html, appData) => {
    if (app.template === 'systems/dnd5e/templates/actors/character-sheet-2.hbs') return;

    const addButtons = html.find(`a.item-create`);
    addButtons.each(function () {

        const firstItemLi = $(this).closest(`li.items-header`).next(`ol.item-list`).find(`li.item`);
        const firstItem = app.object.items.get(firstItemLi?.data("itemId"));

        const prevItemLi = $(this).closest(`li.items-footer`).prev(`li.item`);
        const prevItem = app.object.items.get(prevItemLi?.data("itemId"));

        const item = firstItem || prevItem;
        const customSectionName = item?.getFlag(moduleID, "sectionName");
        if (!customSectionName) return;

        $(this).remove();
        return;
    });

    if (game.settings.get(moduleID, 'hideEmpty')) {
        const headers = html[0].querySelectorAll('li.items-header');
        for (const header of headers) {
            const ol = header.nextElementSibling;
            if (ol.tagName !== 'OL' || ol.childElementCount) continue;

            header.remove();
        }
    }
});


async function customSectionGetData(wrapped) {
    const data = await wrapped();

    for (const type of ["features", "inventory", "spellbook"]) {
        const itemsSpells = type === "spellbook" ? "spells" : "items";

        const items = data[type].reduce((acc, current) => {
            if (current.isclass) return acc;

            return acc.concat(current[itemsSpells]);
        }, []);


        const customSectionItems = items.filter(i => i.flags[moduleID]?.sectionName);
        const customSections = [];
        for (const item of customSectionItems) {
            if (!customSections.includes(item.flags[moduleID].sectionName)) customSections.push(item.flags[moduleID].sectionName);
        }

        for (const section of data[type]) {
            section[itemsSpells] = section[itemsSpells].filter(i => !customSectionItems.includes(i));
        }

        for (const customSection of customSections) {
            const newSection = {
                label: customSection,
                [itemsSpells]: customSectionItems.filter(i => i.flags[moduleID].sectionName === customSection)
            };
            if (type === "features") {
                newSection.hasActions = true;
                newSection.isClass = false;
                newSection.dataset = { type: "feat" };
            } else if (type === "inventory") {

            } else if (type === "spellbook") {
                newSection.canCreate = false;
                newSection.canPrepare = true;
                newSection.dataset = {
                    "preparation.mode": "prepared",
                    type: "spell"
                };
                newSection.usesSlots = false;
            }

            data[type].push(newSection);
        }
    }

    return data;
}

async function characterSheet2getData(wrapped, ...args) {
    const data = await wrapped(...args);

    for (const type of ['inventory', 'features', 'spellbook']) {
        const items = data[type].reduce((acc, current) => {
            if (current.type === 'class') return acc;

            return acc.concat(current[type === 'spellbook' ? 'spells' : 'items']);
        }, []);

        const customSections = [];
        items.forEach(i => {
            const customSection = i.getFlag(moduleID, 'sectionName');
            if (customSection && !customSections.find(s => s.label === customSection)) {
                const sectionObj = {
                    label: customSection,
                    dataset: {
                        type: customSection
                    }
                };
                if (type === 'spellbook') {
                    sectionObj.canCreate = false;
                    sectionObj.canPrepare = true;
                    sectionObj.usesSlots = false;
                    sectionObj.spells = items.filter(i => i.type === 'spell' && i.getFlag(moduleID, 'sectionName') === customSection);
                }
                customSections.push(sectionObj);
            };
        });

        data[type].push(...customSections);
    }

    return data;
}
