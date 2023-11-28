import assert from 'assert';
import puppeteer from 'puppeteer';

describe('Test Thresholdmann', () => {
  let browser, page;

  before(async () => {
    browser = await puppeteer.launch({ headless: true });
    page = await browser.newPage();
    await page.goto('http://127.0.0.1:8080');
  });

  describe('Unit tests', () => {
    describe('Trivial test', () => {
      it('should say hey', async () => {
        const res = await page.evaluate(() => {
          return window.location;
        });
        assert.strictEqual("hey", "hey");
      });
    });
  });
  
  describe('End to end tests', () => {
    describe('Load a file', async () => {
      it('should display title', async () => {
        var title = await page.evaluate(() => {
          return document.title;
        });
        assert.strictEqual(title, "Thresholdmann");
      });
      it('should display "Choose..." message', async () => {
        var msg = await page.evaluate(() => {
          return document.querySelector(".box_input").innerText;
        })
        assert.strictEqual(msg, "\nChoose a .nii.gz or a .nii file or drag it here.");
      });
      it('init with test nifti file', async () => {
        const path = "./img/bear_uchar.nii.gz";
        const res = await page.evaluate(async (path) => {
          await window.initWithPath(path);
          return typeof window.globals.mv.mri;
        }, path);
        assert.strictEqual(res, "object");
      }).timeout(5000);
    });
  });

});
