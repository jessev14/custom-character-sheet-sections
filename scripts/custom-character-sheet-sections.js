const moduleID = "custom-character-sheet-sections";

const lg = x => console.log(x);


Hooks.once('init', () => {
    game.settings.register(moduleID, 'hideEmpty', {
        name: 'Hide Empty Sections',
        scope: 'world',
        config: isNewerVersion('2', game.system.version),
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
                const section = (this.getAttribute('for') === 'features' && customSection) ? sections[grouped] : sections[group ? grouped : ungrouped];
                section.appendChild(item);
            }
        }
        this._applyFilters();
        this._applySorting();
    };
    itemListControlsElement.prototype._applyGrouping = new_applyGrouping;
});

Hooks.once("ready", () => {
    libWrapper.register(moduleID, "CONFIG.Actor.sheetClasses.character['dnd5e.ActorSheet5eCharacter2'].cls.prototype._render", characterSheet2_render, "WRAPPER");

    libWrapper.register(moduleID, 'dnd5e.applications.actor.ActorSheet5eCharacter.prototype.getData', customSectionGetData, 'WRAPPER');
    libWrapper.register(moduleID, 'dnd5e.applications.actor.ActorSheet5eCharacter2.prototype.getData', characterSheet2getData, 'WRAPPER');
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

    if (!Hooks.call('custom-character-sheet-sections.preCustomSectionGetData', data)) {
        return data;
    }

    for (const type of ["features", "inventory", "spellbook"]) {
        const itemsSpells = type === "spellbook" ? "spells" : "items";

        const items = data[type].reduce((acc, current) => {
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
                [itemsSpells]: customSectionItems.filter(i => i.flags[moduleID].sectionName === customSection),
                dataset: {
                    type: customSection
                }

            };
            if (type === "features") {
                newSection.hasActions = true;
                newSection.isClass = false;
            } else if (type === "inventory") {

            } else if (type === "spellbook") {
                newSection.canCreate = false;
                newSection.canPrepare = true;
                newSection.dataset['preparation.mode'] = 'prepared';
                newSection.usesSlots = false;
            }
            data[type].push(newSection);
        }
    }

    return data;
}

async function characterSheet2getData(wrapped, ...args) {
    const data = await wrapped(...args);

    if (!Hooks.call('custom-character-sheet-sections.preCustomSectionGetData', data)) {
        return data;
    }

    for (const type of ['inventory', 'features']) {
        if (!this.actor.flags[moduleID]?.[`sectionOrder-${type}`]) await this.actor.setFlag(moduleID, `sectionOrder-${type}`, data[type].map(s => s.dataset.type));
        const sectionOrder = this.actor.getFlag(moduleID, `sectionOrder-${type}`);
        const newOrder = new Array(sectionOrder.length);
        for (const sec of data[type]) {
            const index = sectionOrder.findIndex(so => sec.dataset.type === so);
            if (index === -1) newOrder.push(sec);
            else newOrder.splice(index, 1, sec);
        }
        data[type] = newOrder;
        const newOrderFlag = newOrder.map(s => s.dataset.type);
        if (JSON.stringify(sectionOrder) !== JSON.stringify(newOrderFlag) && this.actor.isOwner) await this.actor.setFlag(moduleID, `sectionOrder-${type}`, newOrderFlag);
    }
    return data;
}

async function characterSheet2_render(wrapped, ...args) {
    await wrapped(...args);

    if (!Hooks.call('custom-character-sheet-sections.preCustomSectionGetData')) {
        return;
    }

    if (!this.actor.isOwner) return;

    for (const type of ['inventory', 'features']) {
        const sectionElement = this.element[0]?.querySelector(`section[data-item-list="${type}"]`);
        if (!sectionElement) continue;

        sectionElement.querySelectorAll('div.items-section.card').forEach(div => {
            const header = div.querySelector('div.items-header.header');
            for (const direction of ['up', 'down']) {
                const button = document.createElement('div');
                button.classList.add('item-header', direction);
                button.innerHTML = `
                    <a><i class="fa-solid fa-chevron-${direction}"></i></a>
                `;
                button.style.position = 'absolute';
                button.style.right = direction === 'up' ? '25px' : '10px';
                button.style['margin-top'] = '10px';
                button.onclick = async () => {
                    const { actor } = this;
                    const sectionOrder = actor.getFlag(moduleID, `sectionOrder-${type}`);
                    if (!sectionOrder) return;

                    const dir = direction === 'up' ? -1 : 1;
                    let sectionDiv = div.closest('div.items-section.card');
                    const section = sectionDiv.dataset.type;
                    const index = sectionOrder.indexOf(section);
                    let newIndex = index;
                    while (true) {
                        newIndex = newIndex + dir;
                        sectionDiv = dir === -1 ? sectionDiv.previousElementSibling : sectionDiv.nextElementSibling;
                        if (!sectionDiv?.hidden) break;
                    }
                    if (newIndex < 0 || newIndex > sectionOrder.length - 1) return;

                    sectionOrder.splice(index, 1);
                    sectionOrder.splice(newIndex, 0, section);
                    await this.actor.setFlag(moduleID, `sectionOrder-${type}`, sectionOrder);
                };
                header.appendChild(button);
            }
        });
    }
}
